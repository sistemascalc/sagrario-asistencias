const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Store,validateList}=require('../desktop/store.cjs');
const {layout,automaticSeating}=require('../desktop/seating.cjs');
const {csv,printHTML,seatingCSV,seatingHTML}=require('../desktop/export.cjs');
function setup(t,count=22){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sagrario-seats-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const seed={date:'2026-10-25',title:'Grupo de prueba',people:Array.from({length:count},(_,i)=>({id:(i+1)*10,givenNames:'Persona '+i,paternalSurname:'Ejemplo',maternalSurname:'',sponsor:'Padrino '+i,notes:'Conservar'})),attendance:{10:{confirmand:true,sponsor:true,notes:'Nota del día'}}};
  return {root,store:new Store(root,seed),date:seed.date};
}
test('croquis has 160 unique benches, distinguishes zone labels and preserves actual positions',()=>{
  assert.deepEqual(layout.benches.map(b=>b.number),Array.from({length:160},(_,i)=>i+1));
  assert.deepEqual(layout.benches[0],{number:1,row:5,column:12,zone:1});assert.deepEqual(layout.benches[159],{number:160,row:38,column:2,zone:9});assert.equal(layout.zones.length,9);assert.equal(layout.pillars.length,6);
});
test('zone colors match the source and leaders survive attendance, reassigning, copying and backup',t=>{
  assert.deepEqual(layout.zones.map(z=>z.color),['#F2CFEE','#FFFF00','#9966FF','#B4E5A2','#96DCF8','#F6C6AD','#CCCCFF','#CC6600','#99CC00']);
  const {store,date,root}=setup(t),p=store.previewSeating({date});
  const zoneLeaders={1:['  Ana María  ','José & Luis','<Marta>'],8:['=Nombre']};
  const saved=store.saveSeating({date,revision:p.revision,assignments:p.seating.assignments,zoneLeaders});
  assert.deepEqual(saved.seating.zoneLeaders,{1:['Ana María','José & Luis','<Marta>'],8:['=Nombre','','']});
  store.attendance({date,id:10,role:'both',value:false});
  const fresh=store.previewSeating({date,reassign:true});assert.deepEqual(fresh.seating.zoneLeaders,saved.seating.zoneLeaders);
  store.saveSeating({date,revision:fresh.revision,assignments:fresh.seating.assignments});
  assert.deepEqual(new Store(root).get(date).seating.zoneLeaders,saved.seating.zoneLeaders);
  assert.deepEqual(store.create({date:'2026-10-26',sourceDate:date}).seating.zoneLeaders,saved.seating.zoneLeaders);
  store.restore(store.backup());assert.deepEqual(store.get(date).seating.zoneLeaders,saved.seating.zoneLeaders);
  const html=seatingHTML(saved);assert.ok(html.includes('José &amp; Luis'));assert.ok(html.includes('&lt;Marta&gt;'));assert.ok(!html.includes('<Marta>'));assert.ok(html.includes('Encargados por zona'));assert.ok(html.includes('background:#F2CFEE'));
  const moved={...saved,seating:{...saved.seating,assignments:{...saved.seating.assignments,10:{bench:141,pair:1}}}};
  assert.ok(seatingCSV(moved).includes('"\'=Nombre"'));assert.ok(seatingCSV(moved).includes('"Encargado 1","Encargado 2","Encargado 3"'));
});
test('invalid leaders never replace a list and three empty slots can clear a zone',t=>{
  const {store,date}=setup(t),p=store.previewSeating({date}),before=store.get(date);
  for(const zoneLeaders of [null,[],{0:['Ana']},{10:['Ana']},{'01':['Ana']},{1:['A','B','C','D']},{1:[17]},{1:'Ana'},{1:['x'.repeat(121)]}]){
    assert.throws(()=>store.saveSeating({date,revision:p.revision,assignments:p.seating.assignments,zoneLeaders}));assert.deepEqual(store.get(date),before);
  }
  const first=store.saveSeating({date,revision:p.revision,assignments:p.seating.assignments,zoneLeaders:{1:['Ana']}});
  const next=store.previewSeating({date});const clear=store.saveSeating({date,revision:next.revision,assignments:next.seating.assignments,zoneLeaders:{1:['','','']}});
  assert.deepEqual(clear.seating.zoneLeaders[1],['','','']);assert.deepEqual(clear.attendance,first.attendance);assert.deepEqual(clear.people,first.people);assert.deepEqual(clear.seating.assignments,first.seating.assignments);
});
test('22 records occupy eight benches with three intact pairs per bench and retain existing IDs/order',t=>{
  const {store,date}=setup(t),before=store.get(date),preview=store.previewSeating({date});
  assert.deepEqual(store.get(date),before);assert.equal(preview.saved,false);
  const result=store.saveSeating({date,revision:preview.revision,assignments:preview.seating.assignments});
  assert.deepEqual(result.seating.assignments[10],{bench:1,pair:1});assert.deepEqual(result.seating.assignments[30],{bench:1,pair:3});assert.deepEqual(result.seating.assignments[40],{bench:2,pair:1});assert.deepEqual(result.seating.assignments[220],{bench:8,pair:1});
  assert.equal(new Set(Object.values(result.seating.assignments).map(s=>s.bench)).size,8);assert.deepEqual(result.people,before.people);assert.deepEqual(result.attendance,before.attendance);
});
test('invalid, duplicate, stale or oversized assignments cannot partially change data',t=>{
  const {store,date}=setup(t),before=store.get(date),preview=store.previewSeating({date});
  for(const assignments of [{10:{bench:0,pair:1}},{10:{bench:161,pair:1}},{10:{bench:1,pair:4}},{10:{bench:1,pair:1},20:{bench:1,pair:1}},{999:{bench:1,pair:1}},[],null,{'010':{bench:1,pair:1}}])assert.throws(()=>store.saveSeating({date,revision:preview.revision,assignments}));
  assert.deepEqual(store.get(date),before);store.attendance({date,id:10,role:'both',value:false});assert.throws(()=>store.saveSeating({date,revision:preview.revision,assignments:preview.seating.assignments}),/cambió/);assert.equal(store.get(date).seating,undefined);
  assert.throws(()=>automaticSeating(Array.from({length:481},(_,i)=>({id:i+1}))),/480/);assert.equal(Object.keys(automaticSeating(Array.from({length:480},(_,i)=>({id:i+1}))).assignments).length,480);
});
test('manual swaps, attendance, corrections, sorting, copied dates and backups preserve saved places',t=>{
  const {store,date,root}=setup(t),preview=store.previewSeating({date}),assignments=preview.seating.assignments;
  [assignments[10],assignments[220]]=[assignments[220],assignments[10]];store.saveSeating({date,revision:preview.revision,assignments});
  store.reorder({date,ids:store.get(date).people.map(p=>p.id).reverse()});store.attendance({date,id:10,role:'both',value:false});store.edit({date,record:{...store.get(date).people.find(p=>p.id===10),sponsor:'Corregido'},dailyNotes:'Nueva nota'});
  assert.deepEqual(new Store(root,{}).get(date).seating.assignments,assignments);
  assert.deepEqual(store.create({date:'2026-10-26',sourceDate:date}).seating.assignments,assignments);
  const backup=store.backup();store.restore(backup);assert.deepEqual(store.get(date).seating.assignments,assignments);
  store.edit({date,create:true,record:{id:999,givenNames:'Nueva',paternalSurname:'Persona',maternalSurname:'',sponsor:'',notes:''}});assert.equal(store.get(date).seating.assignments[999],undefined);
  assert.equal(store.previewSeating({date}).saved,true);assert.equal(store.previewSeating({date,reassign:true}).saved,false);
});
test('legacy lists remain readable and exports show bank assignment without modifying attendance',t=>{
  const {store,date}=setup(t),before=store.get(date);assert.equal(validateList(before).seating,undefined);
  const preview=store.previewSeating({date});const list=store.saveSeating({date,revision:preview.revision,assignments:preview.seating.assignments});
  assert.ok(csv(list).includes('"Banca","Pareja"'));assert.ok(printHTML(list).includes('>Banca</th>'));
  const output=seatingCSV(list);assert.ok(output.includes('"2026-10-25","8","1","1","220"'));assert.equal(output.split('\r\n').length,23);
  const html=seatingHTML(list);assert.ok(html.includes('8 bancas asignadas'));assert.ok(html.includes('Banca 8: 1 pareja asignada; 2 lugares de pareja libres.'));assert.ok(html.includes('Croquis de ubicación'));
});
