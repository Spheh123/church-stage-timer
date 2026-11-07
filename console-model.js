import { advanceExpired } from './live-session.js';

export function getOverview(value, now) {
  const session = advanceExpired(value, now);
  const program = session.program || [];
  const current = program[session.currentIndex];
  const next = program[session.currentIndex + 1];
  const remaining = session.isRunning && Number.isFinite(session.endTime)
    ? Math.max(0, session.endTime - now) : Math.max(0, session.remainingMs || 0);
  const complete = program.length > 0 && session.currentIndex >= program.length;
  const untouched = session.currentIndex === 0 && remaining === (current?.duration || 0) * 60000;
  const status = complete ? 'Service complete' : session.isRunning ? 'Running' : !program.length || untouched ? 'Ready' : 'Paused';
  const later = program.slice(session.currentIndex + 1).reduce((sum, item) => sum + item.duration * 60000, 0);
  return { current, next, remaining, status, complete,
    segmentEnd: session.isRunning ? now + remaining : null,
    serviceEnd: session.isRunning ? now + remaining + later : null,
    progress: current ? Math.min(100, Math.max(0, (1 - remaining / (current.duration * 60000)) * 100)) : 0
  };
}

export function readProgramBackup(text) {
  const backup = JSON.parse(text);
  if (backup.version !== 1 || backup.type !== 'stage-timer-program' || !Array.isArray(backup.program) || !backup.program.length || backup.program.length > 500) {
    throw new Error('Choose a Stage Timer program backup containing 1–500 segments.');
  }
  const program = backup.program.map(item => {
    if (!item || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 200 ||
      typeof item.duration !== 'number' || !Number.isFinite(item.duration) || item.duration <= 0 || item.duration > 1440 ||
      (item.speaker != null && (typeof item.speaker !== 'string' || item.speaker.length > 200))) {
      throw new Error('The backup contains an invalid segment. No changes were made.');
    }
    return { title: item.title.trim(), speaker: (item.speaker || '').trim(), duration: item.duration };
  });
  return { serviceName: String(backup.serviceName || '').trim().slice(0, 200), program };
}

export function normalizeDisplaySettings(value = {}) {
  const logo = typeof value.logo === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value.logo) && value.logo.length < 280000 ? value.logo : '';
  return { theme: value.theme === 'contrast' ? 'contrast' : 'classic',
    size: ['standard', 'large'].includes(value.size) ? value.size : 'standard', logo };
}
