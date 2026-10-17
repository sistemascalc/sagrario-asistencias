const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const XLSX=require('xlsx');
const {ExcelImport,readWorkbook,loadWorkbook,sheetInfo,convertRows}=require('../desktop/excel.cjs');
const {Store}=require('../desktop/store.cjs');
const {csv}=require('../desktop/export.cjs');
const headers=['Número','Nombre(s)','Apellido paterno','Apellido materno','Padrino / madrina','Observaciones'];
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagrario-excel-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function workbook(file,rows,bookType='xlsx'){
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Información']]),'Portada');
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'Personas');XLSX.writeFile(book,file,{bookType});
}
function config(book){return sheetInfo(book,{sheetIndex:1});}
test('Excel XLSX and XLS preserve accents, separate surnames, notes and IDs, and detect a displaced header',async t=>{
  const dir=setup(t);
  for(const ext of ['xlsx','xls']){
    const file=path.join(dir,'lista.'+ext);
    workbook(file,[['Catequesis'],[],headers,['001','María José','López','Pérez','Ángel García','Cambio de padrino'],[],[7,'Luis','','','','']],ext==='xls'?'biff8':'xlsx');
    const book=await loadWorkbook(file),info=config(book),result=convertRows(book,info);
    assert.equal(info.headerRow,3);assert.equal(result.valid,true);assert.equal(result.total,2);assert.equal(result.blankRows,1);
    assert.deepEqual(result.people[0],{id:1,givenNames:'María José',paternalSurname:'López',maternalSurname:'Pérez',sponsor:'Ángel García',notes:'Cambio de padrino'});
    assert.equal(result.withoutSponsor,1);
  }
});
test('CSV exported by this app can be reimported without carrying attendance',t=>{
  const dir=setup(t),file=path.join(dir,'lista.csv');
  fs.writeFileSync(file,csv({date:'2026-10-18',people:[{id:3,givenNames:'José',paternalSurname:'Pérez',maternalSurname:'',sponsor:'Madrina',notes:'Nota, con coma'}],attendance:{3:{confirmand:true,sponsor:true,notes:'Sólo de ese día'}}}));
  const book=readWorkbook(file),info=sheetInfo(book),result=convertRows(book,info);
  assert.equal(result.valid,true);assert.equal(result.people[0].givenNames,'José Pérez');assert.equal(result.people[0].notes,'Nota, con coma');
});
test('invalid and duplicate IDs, missing names and long text prevent partial import',t=>{
  const dir=setup(t),file=path.join(dir,'errores.xlsx');
  workbook(file,[headers,[1,'Persona'],['001','Duplicada'],[2,''],['2.5','Inválido'],[4,'A'.repeat(301)]]);
  const book=readWorkbook(file),result=convertRows(book,config(book));
  assert.equal(result.valid,false);assert.equal(result.total,5);
  assert.ok(result.errors.some(e=>e.includes('se repite')));assert.ok(result.errors.some(e=>e.includes('falta el nombre')));
  assert.ok(result.errors.some(e=>e.includes('entero')));assert.ok(result.errors.some(e=>e.includes('demasiado largo')));
});
test('automatic numbering ignores blank rows, and duplicate column mappings are rejected',t=>{
  const file=path.join(setup(t),'sin-numero.xlsx');workbook(file,[['Nombre completo','Padrino'],['Ana Prueba',''],[],['Luis Prueba','Madrina']]);
  const book=readWorkbook(file),info=config(book);
  assert.throws(()=>convertRows(book,info),/numeración automática/);
  const result=convertRows(book,{...info,autoNumber:true});assert.equal(result.valid,true);assert.deepEqual(result.people.map(p=>p.id),[1,2]);
  assert.throws(()=>convertRows(book,{...info,autoNumber:true,mapping:{...info.mapping,notes:0}}),/un solo dato/);
});
test('formulas and cell errors are reported rather than evaluated or silently accepted',t=>{
  const file=path.join(setup(t),'formulas.xlsx'),book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([headers,[1,'Original'],[2,'Error']]);
  sheet.B2={t:'s',v:'Resultado',f:'"Resultado"'};sheet.B3={t:'e',v:7};XLSX.utils.book_append_sheet(book,sheet,'Datos');XLSX.writeFile(book,file);
  const parsed=readWorkbook(file),result=convertRows(parsed,sheetInfo(parsed));assert.equal(result.valid,false);
  assert.ok(result.errors.some(e=>e.includes('fórmula')));assert.ok(result.errors.some(e=>e.includes('error de Excel')));
});
test('empty files, unsupported extensions, oversized files and excessive dimensions fail clearly',t=>{
  const dir=setup(t),empty=path.join(dir,'vacio.xlsx'),book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,{},'Vacía');XLSX.writeFile(book,empty);
  assert.throws(()=>readWorkbook(empty),/vacío/);assert.throws(()=>readWorkbook(path.join(dir,'archivo.exe')),/Selecciona/);
  const huge=path.join(dir,'grande.csv');fs.writeFileSync(huge,Buffer.alloc(10*1024*1024+1));assert.throws(()=>readWorkbook(huge),/10 MB/);
  const wide=path.join(dir,'ancho.xlsx');book.Sheets.Vacía={CW1:{t:'s',v:'Fuera de límite'},'!ref':'CW1'};XLSX.writeFile(book,wide);assert.throws(()=>readWorkbook(wide),/100 columnas/);
});
test('import sessions validate again on save, preserve existing days, and persist a new list with blank attendance',async t=>{
  const dir=setup(t),file=path.join(dir,'nueva.xlsx');workbook(file,[headers,[9,'Nueva','Persona','','Padrino','Observación']]);
  const seed={date:'2026-10-18',title:'Original',people:[{id:1,givenNames:'Original',paternalSurname:'',maternalSurname:'',sponsor:'',notes:''}],attendance:{1:{confirmand:true,sponsor:true,notes:'Conservar'}}};
  const store=new Store(path.join(dir,'data'),seed),before=store.get(seed.date),session=new ExcelImport(),opened=await session.open(file);
  const args={token:opened.token,...session.info({token:opened.token,sheetIndex:1}),date:'2026-10-19',title:'Importada'};
  assert.equal(session.preview(args).valid,true);assert.equal(store.list().length,1);
  assert.throws(()=>session.commit({...args,date:seed.date},store),/Ya existe/);
  assert.throws(()=>session.commit({...args,mapping:{...args.mapping,givenNames:-1}},store),/nombre/);
  assert.throws(()=>session.commit({...args,date:'2026-02-30'},store),/fecha válida/);
  assert.deepEqual(store.get(seed.date),before);
  assert.deepEqual(session.commit(args,store),{date:'2026-10-19',total:1});
  const reopened=new Store(path.join(dir,'data'),seed).get(args.date);
  assert.deepEqual(reopened.attendance[9],{confirmand:false,sponsor:false,notes:''});assert.equal(reopened.people[0].notes,'Observación');
  assert.throws(()=>session.preview(args),/nuevamente/);
});
test('all rows are validated even beyond the eight-row preview, and discarded sessions cannot save',async t=>{
  const dir=setup(t),file=path.join(dir,'lista.xlsx');workbook(file,[headers,...Array.from({length:20},(_,i)=>[i+1,'Persona '+i]),[1,'Duplicada al final']]);
  const session=new ExcelImport(),opened=await session.open(file),args={token:opened.token,...session.info({token:opened.token,sheetIndex:1})};
  const preview=session.preview(args);assert.equal(preview.people.length,8);assert.equal(preview.total,21);assert.equal(preview.valid,false);assert.match(preview.errors[0],/Fila 22/);
  session.discard(opened.token);assert.throws(()=>session.preview(args),/nuevamente/);
});
