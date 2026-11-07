const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const program = [{title:'Worship', speaker:'Choir', duration:10}, {title:'Word',speaker:'Pastor',duration:20}];
const live = () => ({program, currentIndex:0, remainingMs:600000, isRunning:true, endTime:610000, updatedAt:1, serviceName:'Sunday Service'});

test('finish estimates follow the live deadline and paused timers have no estimates', async () => {
  const {getOverview} = await import('./console-model.js');
  let overview = getOverview(live(),70000);
  assert.equal(overview.remaining,540000);
  assert.equal(overview.segmentEnd,610000);
  assert.equal(overview.serviceEnd,1810000);
  assert.equal(overview.next.title,'Word');
  overview=getOverview({...live(),isRunning:false,endTime:null,remainingMs:540000},70000);
  assert.equal(overview.status,'Paused');
  assert.equal(overview.serviceEnd,null);
  assert.equal(getOverview({...live(),currentIndex:2,isRunning:false,remainingMs:0},70000).status,'Service complete');
});

test('backups round trip the program and reject malformed data without silently losing segments', async () => {
  const {readProgramBackup} = await import('./console-model.js');
  const backup={type:'stage-timer-program',version:1,serviceName:'Sunday',program};
  assert.deepEqual(readProgramBackup(JSON.stringify(backup)), {serviceName:'Sunday',program});
  for (const invalid of [{...backup,version:2},{...backup,program:[]},{...backup,program:[{title:'Invalid',duration:-1}]},{...backup,program:[{title:'Invalid',duration:'10'}]}]) {
    assert.throws(()=>readProgramBackup(JSON.stringify(invalid)));
  }
});

test('display preferences accept only supported themes, sizes and image formats', async () => {
  const {normalizeDisplaySettings} = await import('./console-model.js');
  assert.deepEqual(normalizeDisplaySettings({theme:'contrast',size:'large',logo:'data:image/png;base64,aGVsbG8='}), {theme:'contrast',size:'large',logo:'data:image/png;base64,aGVsbG8='});
  assert.deepEqual(normalizeDisplaySettings({theme:'unknown',size:'huge',logo:'javascript:alert(1)'}), {theme:'classic',size:'standard',logo:''});
});

async function controllerHarness() {
  const nodes = new Map();
  const classes = new Set();
  const callbacks = new Map();
  const writes = [];
  const prompts = [];
  let shared = live();
  let accepted = false;
  const node = () => ({value:'',innerText:'',innerHTML:'',style:{},dataset:{},listeners:{},classList:{add(){}},setAttribute(){},
    addEventListener(event, handler){this.listeners[event]=handler;},append(){},appendChild(){},focus(){}});
  const getNode=id=>{if(!nodes.has(id)) nodes.set(id,node());return nodes.get(id);};
  const snapshot = value => ({val:()=>structuredClone(value)});
  const context = vm.createContext({
    ...await import('./console-model.js'), ...await import('./live-session.js'), watchDisplaySettings(){},
    document:{getElementById:getNode,createElement:node,querySelectorAll:()=>[],body:{classList:{
      toggle(name,on){if(on)classes.add(name);else classes.delete(name);}, contains:name=>classes.has(name)
    }}},
    window:{matchMedia:()=>({matches:true})},localStorage:{getItem:()=>null,setItem(){}},setInterval(){},Date,console,
    db:{},ref:(_db,path)=>path,
    onValue(path, callback, options){
      if (options?.onlyOnce) callback(snapshot(path==='sessionState'?shared:{presetId:'sunday',serviceName:'Sunday Service',program}));
      else callbacks.set(path,callback);
    },
    set(path,value){writes.push(path); return Promise.resolve();},
    runTransaction(path,update){
      const proposed=update(shared);
      if(proposed){shared=structuredClone(proposed);writes.push(path);callbacks.get('sessionState')?.(snapshot(shared));}
      return Promise.resolve({committed:Boolean(proposed),snapshot:snapshot(shared)});
    },
    alert(message){prompts.push(message);},confirm(message){prompts.push(message);return accepted;}
  });
  vm.runInContext(fs.readFileSync('script.js','utf8').replace(/^import .*;\r?\n/gm,''),context);
  getNode('programPreset').value='sunday';
  callbacks.get('sessionState')(snapshot(shared));
  callbacks.get('.info/connected')(snapshot(true));
  return {context,nodes,classes,writes,prompts,callbacks,snapshot,accept(){accepted=true;},shared:()=>shared};
}

test('live view opens on phones and can return to setup without writing the session', async () => {
  const h=await controllerHarness();
  assert.equal(h.classes.has('live-mode'),true);
  assert.equal(h.nodes.get('setupPanel').open,false);
  h.nodes.get('viewToggle').listeners.click();
  assert.equal(h.classes.has('live-mode'),false);
  assert.equal(h.nodes.get('setupPanel').open,true);
  assert.deepEqual(h.writes,[]);
});

test('service dropdown selection never replaces a live service; cancelled load and reset do not write', async () => {
  const h=await controllerHarness();
  h.nodes.get('programPreset').listeners.change();
  h.context.window.loadProgram();
  await h.context.window.resetTimer();
  assert.deepEqual(h.writes,[]);
  assert.equal(h.shared().isRunning,true);
  assert.equal(h.prompts.length,2);
  h.accept();
  await h.context.window.resetTimer();
  assert.equal(h.shared().isRunning,false);
  assert.equal(h.shared().currentIndex,0);
});

test('offline controls cannot reset or load the service and show a reconnecting status', async () => {
  const h=await controllerHarness();
  h.callbacks.get('.info/connected')(h.snapshot(false));
  h.accept();
  await h.context.window.resetTimer();
  h.context.window.loadProgram();
  assert.deepEqual(h.writes,[]);
  assert.match(h.nodes.get('connectionStatus').innerText,/Reconnecting/);
});
