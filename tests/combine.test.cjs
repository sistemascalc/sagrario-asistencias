const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../desktop/store.cjs');
const {comparePeople}=require('../src/ordering.js');
const {csv,printHTML}=require('../desktop/export.cjs');
const p=(id,givenNames,paternalSurname='',maternalSurname='')=>({id,givenNames,paternalSurname,maternalSurname,sponsor:'Padrino '+id,notes:'Nota '+id});
function setup(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sagrario-combine-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const first={date:'2026-10-18',title:'Primera',source:'',people:[p(50,'Ana','Zúñiga'),p(7,'Luis','Álvarez','B'),p(9,'Marta','Núñez'),p(8,'Nora','Ñáñez')],attendance:{50:{confirmand:true,sponsor:false,notes:'Día anterior'},7:{confirmand:true},9:{sponsor:true},8:{confirmand:true}}};
  const store=new Store(root,first);
  store.save({date:'2026-10-19',title:'Segunda',people:[{...p(50,'Ana','Zúñiga'),sponsor:'Padrino corregido',notes:'Nota reciente'},p(7,'Luis','Álvarez','B'),p(20,'Ximena','Alvarez','A'),p(3,'Paula','Nava'),p(22,'Sin apellido')],attendance:{50:{confirmand:true,sponsor:true,notes:'No copiar'},7:{confirmand:true},20:{confirmand:true},3:{confirmand:true},22:{confirmand:true}}});
  return {root,store,args:{sourceDates:['2026-10-18','2026-10-19'],date:'2026-10-20',title:'Combinada'}};
}
test('combines independent groups, preserves matching names and numbers, sorts then numbers from one',t=>{
  const {store,args}=setup(t),before=store.backup().lists,preview=store.previewCombined(args);
  assert.equal(preview.total,8);assert.equal(preview.missingSurnames,1);
  assert.deepEqual(preview.people.map(p=>p.id),[1,2,3,4,5,6,7,8]);
  assert.deepEqual(preview.people.map(p=>p.givenNames),['Ximena','Luis','Luis','Paula','Nora','Ana','Ana','Sin apellido']);
  const result=store.createCombined({...args,revision:preview.revision});
  assert.deepEqual(result.people,preview.people);
  assert.deepEqual(result.people.filter(p=>p.givenNames==='Ana').map(p=>[p.sponsor,p.notes]),[['Padrino 50','Nota 50'],['Padrino corregido','Nota reciente']]);
  assert.ok(!result.people.some(p=>p.givenNames==='Marta'));for(const attendance of Object.values(result.attendance))assert.deepEqual(attendance,{confirmand:false,sponsor:false,notes:''});
  assert.deepEqual(args.sourceDates.map(d=>store.get(d)),[...before].reverse());
});
test('selection, dates, empty attendance and source changes are validated without saving a partial list',t=>{
  const {store,args}=setup(t);assert.throws(()=>store.previewCombined({sourceDates:[args.sourceDates[0],args.sourceDates[0]]}),/dos listas/);
  assert.throws(()=>store.previewCombined({sourceDates:[args.sourceDates[0]]}),/dos listas/);
  const preview=store.previewCombined(args);
  assert.throws(()=>store.createCombined({...args,revision:preview.revision,date:'2026-02-30'}),/fecha válida/);
  assert.throws(()=>store.createCombined({...args,revision:preview.revision,date:args.sourceDates[0]}),/Ya existe/);
  store.attendance({date:args.sourceDates[0],id:50,role:'confirmand',value:false});
  assert.throws(()=>store.createCombined({...args,revision:preview.revision}),/cambiaron/);assert.equal(store.list().length,2);
  for(const date of args.sourceDates){const l=store.get(date);for(const id of Object.keys(l.attendance))l.attendance[id].confirmand=false;store.save(l);}
  const empty=store.previewCombined(args);assert.equal(empty.total,0);assert.throws(()=>store.createCombined({...args,revision:empty.revision}),/No hay confirmandos/);
});
test('the same source number with different names creates two people without any resolution',t=>{
  const {store,args}=setup(t),second=store.get(args.sourceDates[1]);second.people.find(p=>p.id===50).givenNames='Otra persona';store.save(second);
  const preview=store.previewCombined(args);assert.equal(preview.total,8);
  const result=store.createCombined({...args,revision:preview.revision});
  assert.deepEqual(result.people.map(p=>p.id),[1,2,3,4,5,6,7,8]);
  assert.ok(result.people.some(p=>p.givenNames==='Ana'));assert.ok(result.people.some(p=>p.givenNames==='Otra persona'));
  assert.equal(store.get(args.sourceDates[1]).people.find(p=>p.id===50).givenNames,'Otra persona');
});
test('identical names and source numbers remain independent even at the maximum old ID',t=>{
  const {store,args}=setup(t);
  const a=store.get(args.sourceDates[0]),b=store.get(args.sourceDates[1]);
  a.people=[p(999999,'Primera','Prueba'),p(1,'Homónimo','Ejemplo')];a.attendance={999999:{confirmand:true},1:{confirmand:true}};
  b.people=[p(999999,'Segunda','Prueba'),p(1,'Homónimo','Ejemplo')];b.attendance={999999:{confirmand:true},1:{confirmand:true}};store.save(a);store.save(b);
  const preview=store.previewCombined(args),result=store.createCombined({...args,revision:preview.revision});
  assert.equal(result.people.length,4);assert.deepEqual(result.people.map(p=>p.id),[1,2,3,4]);
  assert.deepEqual(result.people.map(p=>p.givenNames),['Homónimo','Homónimo','Primera','Segunda']);
});
test('combined capacity counts both groups and rejects overflow without creating a list',t=>{
  const {store,args}=setup(t);
  for(const [index,date] of args.sourceDates.entries()){
    const people=Array.from({length:5000+index},(_,i)=>p(i+1,'Persona','Ejemplo'));
    store.save({date,title:'Grupo',people,attendance:Object.fromEntries(people.map(p=>[p.id,{confirmand:true}]))});
  }
  const preview=store.previewCombined(args);assert.equal(preview.total,10001);assert.equal(preview.people.length,12);
  assert.throws(()=>store.createCombined({...args,revision:preview.revision}),/10,000/);assert.equal(store.list().length,2);
});
test('surname sorting uses paternal, maternal and given names, places missing surnames last and preserves ñ',()=>{
  const people=[p(1,'Bea','Ñáñez'),p(2,'Ana','Nava'),p(3,'Zoe','Álvarez','Bravo'),p(4,'Ana','alvarez','Bravo'),p(5,'Pedro','Álvarez','Alba'),p(6,'Aaron')];
  assert.deepEqual(people.sort(comparePeople).map(p=>p.id),[5,4,3,2,1,6]);
});
test('manual positions survive attendance, corrections, new dates, backups and restart; exports use saved order',t=>{
  const {store,args,root}=setup(t),preview=store.previewCombined(args);store.createCombined({...args,revision:preview.revision});
  const ids=[6,8,5,4,3,2,1,7];store.reorder({date:args.date,ids});
  store.attendance({date:args.date,id:6,role:'confirmand',value:true});store.attendance({date:args.date,id:6,role:'sponsor',value:true});
  const record={...store.get(args.date).people[0],notes:'Nota conservada'};store.edit({date:args.date,record,dailyNotes:'Nota del día'});
  const reopened=new Store(root,{}),list=reopened.get(args.date);assert.deepEqual(list.people.map(p=>p.id),ids);assert.deepEqual(list.attendance[6],{confirmand:true,sponsor:true,notes:'Nota del día'});
  assert.deepEqual(reopened.create({date:'2026-10-21',sourceDate:args.date}).people.map(p=>p.id),ids);
  const text=csv(list);assert.ok(text.indexOf('"6"')<text.indexOf('"8"'));
  const html=printHTML(list);assert.ok(html.indexOf('<td>6</td>')<html.indexOf('<td>8</td>'));
  const backup=reopened.backup();reopened.reorder({date:args.date,ids:[...ids].reverse()});reopened.restore(backup);assert.deepEqual(reopened.get(args.date).people.map(p=>p.id),ids);
});
test('invalid permutations cannot drop or duplicate people, and adding a person preserves existing positions',t=>{
  const {store,args}=setup(t),date=args.sourceDates[0],before=store.get(date);
  for(const ids of [[50],[50,7,9,9],[50,7,9,99],['50',7,9,8]])assert.throws(()=>store.reorder({date,ids}),/orden no es válido/);
  assert.deepEqual(store.get(date),before);
  store.reorder({date,ids:[8,9,7,50]});store.edit({date,create:true,record:p(2,'Nueva','Persona'),dailyNotes:''});assert.deepEqual(store.get(date).people.map(p=>p.id),[8,9,7,50,2]);
});
