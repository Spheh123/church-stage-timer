// Pure operations shared by controllers and the display. Deadlines, rather than
// interval counts, keep time when a browser sleeps or resumes.
export function advanceExpired(session, now) {
  if (!session?.isRunning || !Number.isFinite(session.endTime)) return session;
  let next = { ...session };
  const program = session.program || [];
  while (next.isRunning && next.endTime <= now) {
    next.currentIndex += 1;
    if (next.currentIndex >= program.length) {
      next.currentIndex = program.length;
      next.isRunning = false;
      next.endTime = null;
      next.remainingMs = 0;
    } else {
      next.remainingMs = program[next.currentIndex].duration * 60000;
      next.endTime += next.remainingMs;
    }
  }
  return next;
}

export function applyTimerAction(session, action, now, amount = 0) {
  if (!session) return;
  let next = advanceExpired(session, now);
  next = { ...next };
  const program = next.program || [];
  const remaining = next.isRunning && Number.isFinite(next.endTime)
    ? Math.max(0, next.endTime - now) : Math.max(0, next.remainingMs || 0);
  if (action === 'advance') {
    if (next.currentIndex === session.currentIndex && next.isRunning === session.isRunning) return;
  } else if (action === 'start') {
    if (!program.length || next.isRunning) return;
    if (next.currentIndex >= program.length) next.currentIndex = 0;
    next.remainingMs = remaining || program[next.currentIndex].duration * 60000;
    next.isRunning = true;
    next.endTime = now + next.remainingMs;
  } else if (action === 'pause') {
    next.remainingMs = remaining;
    next.isRunning = false;
    next.endTime = null;
  } else if (action === 'adjust') {
    if (!program[next.currentIndex]) return;
    next.remainingMs = Math.max(0, remaining + amount * 60000);
    next.endTime = next.isRunning ? now + next.remainingMs : null;
  } else if (action === 'reset') {
    next.currentIndex = 0;
    next.remainingMs = program[0] ? program[0].duration * 60000 : 0;
    next.isRunning = false;
    next.endTime = null;
  } else if (action === 'next' || action === 'previous') {
    const index = next.currentIndex + (action === 'next' ? 1 : -1);
    if (!program.length || index < 0 || index > program.length) return;
    next.currentIndex = index;
    next.remainingMs = program[index] ? program[index].duration * 60000 : 0;
    next.isRunning = next.isRunning && index < program.length;
    next.endTime = next.isRunning ? now + next.remainingMs : null;
  }
  next.updatedAt = Math.max(now, (session.updatedAt || 0) + 1);
  return next;
}
