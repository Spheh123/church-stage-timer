const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const load = () => import('./live-session.js');
const session = () => ({ program: [{title:'Worship',duration:1},{title:'Word',duration:2}], currentIndex:0, remainingMs:60000, isRunning:true, endTime:60000, updatedAt:1 });
test('sleep and resume preserve elapsed time across segment boundaries', async () => {
  const {advanceExpired} = await load();
  const resumed = advanceExpired(session(), 90000);
  assert.equal(resumed.currentIndex,1);
  assert.equal(resumed.endTime,180000);
  assert.equal(resumed.endTime-90000,90000);
  assert.equal(advanceExpired(session(),200000).isRunning,false);
});
test('retrying concurrent segment advancement advances only once', async () => {
  const {applyTimerAction} = await load();
  const next = applyTimerAction(session(),'advance',60001);
  assert.equal(next.currentIndex,1);
  assert.equal(applyTimerAction(next,'advance',60001),undefined);
});
test('controllers apply pause and added minutes to the current shared value', async () => {
  const {applyTimerAction: apply} = await load();
  let value = apply(session(),'adjust',10000,1);
  value = apply(value,'adjust',10000,1);
  assert.equal(value.endTime,180000);
  value = apply(value,'pause',20000);
  assert.equal(value.remainingMs,160000);
  value = apply(value,'start',40000);
  assert.equal(value.endTime,200000);
  assert.equal(apply(value,'start',50000),undefined);
});
test('opening and reconnecting a controller never writes a live session or loads a preset', async () => {
  const listeners = new Map();
  let writes = 0;
  const nodes = new Map();
  const node = () => ({ value:'', innerText:'', innerHTML:'', style:{}, dataset:{}, classList:{toggle(){},add(){}}, setAttribute(){}, addEventListener(){}, append(){}, appendChild(){}, focus(){} });
  const context = vm.createContext({
    ...await import('./console-model.js'), watchDisplaySettings(){},
    db:{}, ref:(_db,path)=>path, set:()=>{writes++;}, runTransaction:()=>{writes++; return Promise.resolve({committed:true});},
    onValue:(path, callback, options)=>{ if(options?.onlyOnce) callback({val:()=>session()}); else listeners.set(path,callback); },
    localStorage:{getItem:()=>null,setItem(){}}, window:{matchMedia:()=>({matches:true})}, setInterval(){}, console, Date,
    alert(){}, confirm:()=>true,
    document:{getElementById:id=>{if(!nodes.has(id)) nodes.set(id,node()); return nodes.get(id);}, createElement:node, querySelectorAll:()=>[],body:{classList:{toggle(){}}}}
  });
  const source = fs.readFileSync('script.js','utf8').replace(/^import .*;\r?\n/gm,'');
  vm.runInContext(source,context);
  listeners.get('sessionState')({val:()=>session()});
  listeners.get('.info/connected')({val:()=>true});
  listeners.get('.info/connected')({val:()=>false});
  listeners.get('.info/connected')({val:()=>true});
  assert.equal(writes,0);
  assert.equal(listeners.has('programs/sunday'),false);
  assert.equal(nodes.get('currentTitle').innerText,'Worship');
});
test('display advances the program without any controller phone', async () => {
  const operations = await load();
  let tick;
  let shared = session();
  let now = 10000;
  const listeners = new Map();
  const nodes = new Map();
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({ ...operations, Date:Clock, console,
    ...await import('./console-model.js'), watchDisplaySettings(){},
    db:{}, ref:(_db,path)=>path,
    onValue:(path, callback)=>listeners.set(path,callback),
    runTransaction:(_ref, update)=>{ const next=update(shared); if(next) shared=next; return Promise.resolve(); },
    setInterval:callback=>{tick=callback;},
    document:{getElementById:id=>{if(!nodes.has(id)) nodes.set(id,{addEventListener(){}});return nodes.get(id);},body:{classList:{toggle(){}}}}
  });
  const source=fs.readFileSync('display.html','utf8').match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*;\r?\n/gm,'');
  vm.runInContext(source,context);
  listeners.get('sessionState')({val:()=>shared});
  listeners.get('.info/connected')({val:()=>true});
  now=90000;
  tick();
  await Promise.resolve();
  assert.equal(shared.currentIndex,1);
  assert.equal(shared.endTime,180000);
  assert.equal(nodes.get('currentTitle').innerText,'Word');
});
