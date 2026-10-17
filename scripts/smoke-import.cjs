// End-to-end import checks use generated examples and a disposable data folder.
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),XLSX=require('xlsx');
const root=path.resolve(__dirname,'..'),data=path.join(root,'tmp','import-smoke-'+Date.now());fs.mkdirSync(data,{recursive:true});
const headers=['Número','Nombre(s)','Apellido paterno','Apellido materno','Padrino / madrina','Observaciones'];
const file=path.join(data,'Lista de ejemplo.xlsx'),bad=path.join(data,'Repetidos.xlsx'),book=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Información del encuentro']]),'Portada');
XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Ejemplo de importación'],[],headers,[21,'María','Ejemplo','Prueba','Ana Ejemplo','Revisar apellido'],[45,'José','Ejemplo','Prueba','Luis Ejemplo','']]),'Catequesis');
XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Nombre completo','Padrino'],['Persona de ejemplo','Padrino de ejemplo']]),'Sin números');XLSX.writeFile(book,file);
const badBook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(badBook,XLSX.utils.aoa_to_sheet([headers,[1,'Persona'],[1,'Duplicada']]),'Datos');XLSX.writeFile(badBook,bad);
let application;const errors=[];
async function launch(){const env={...process.env,SAGRARIO_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;application=await electron.launch({...(process.env.SAGRARIO_TEST_EXE?{executablePath:process.env.SAGRARIO_TEST_EXE,args:[]}:{args:[root]}),env,timeout:60000});const page=await application.firstWindow();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());await page.getByRole('heading',{name:'Registro de asistencia',exact:true}).waitFor();return page;}
async function pick(page,filename){await application.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},filename);await page.locator('#excel-choose').click();await page.getByText(path.basename(filename),{exact:true}).waitFor();}
async function main(){
  let page=await launch();const original=fs.readFileSync(path.join(data,'lists','2026-10-18.json'),'utf8');
  await page.getByRole('button',{name:'Importar Excel',exact:false}).click();
  await application.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});});await page.locator('#excel-choose').click();assert.equal(await page.locator('#excel-config').isVisible(),false);
  await pick(page,file);await page.locator('#excel-sheet').selectOption('1');await page.getByText('2 personas encontradas',{exact:true}).waitFor();
  assert.equal(await page.locator('#excel-header').inputValue(),'3');
  await page.locator('#excel-date').fill('2026-10-18');assert.equal(await page.locator('#excel-save').isEnabled(),false);
  await page.locator('#excel-date').fill('2026-10-20');await page.locator('#excel-title').fill('Catequesis de ejemplo');
  assert.equal(await page.locator('#excel-save').isEnabled(),true);
  // Capture the import screen using fictitious records only.
  await page.locator('#excel-preview').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'tmp','excel-import-preview.png')});
  await page.locator('#excel-save').click();await page.locator('#modal').waitFor({state:'hidden'});await page.getByRole('heading',{name:'Catequesis de ejemplo',exact:true}).waitFor();
  await page.getByRole('textbox',{name:'Buscar por número, nombre o padrino'}).fill('21');assert.equal(await page.locator('#table-area tbody tr').count(),1);
  assert.equal(await page.getByRole('checkbox',{name:'Asistencia confirmando 21',exact:true}).isChecked(),false);
  await page.getByRole('checkbox',{name:'Asistencia confirmando 21',exact:true}).check();await page.getByRole('checkbox',{name:'Asistencia padrino 21',exact:true}).check();
  assert.equal(fs.readFileSync(path.join(data,'lists','2026-10-18.json'),'utf8'),original);
  await application.close();page=await launch();await page.locator('#date-select').selectOption('2026-10-20');await page.getByRole('heading',{name:'Catequesis de ejemplo',exact:true}).waitFor();await page.getByRole('textbox',{name:'Buscar por número, nombre o padrino'}).fill('21');
  assert.equal(await page.getByRole('checkbox',{name:'Asistencia padrino 21',exact:true}).isChecked(),true);
  await page.getByRole('button',{name:'Importar Excel',exact:false}).click();await pick(page,bad);await page.getByText(/el número 1 se repite/).waitFor();assert.equal(await page.locator('#excel-save').isEnabled(),false);
  await pick(page,file);await page.locator('#excel-sheet').selectOption('2');await page.getByText(/activa la numeración automática/).waitFor();await page.locator('#excel-auto').check();await page.getByText('1 personas encontradas',{exact:true}).waitFor();
  await page.locator('#excel-date').fill('2026-10-21');await page.locator('#excel-save').click();await page.locator('#modal').waitFor({state:'hidden'});
  assert.equal(JSON.parse(fs.readFileSync(path.join(data,'lists','2026-10-21.json'))).people[0].id,1);
  await page.getByRole('button',{name:'Listas y calendario',exact:false}).click();await page.getByRole('button',{name:'Importar Excel',exact:false}).click();await pick(page,file);await page.getByRole('button',{name:'Cancelar',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
  assert.equal(fs.readdirSync(path.join(data,'lists')).filter(n=>n.endsWith('.json')).length,3);assert.deepEqual(errors,[]);
  await application.close();application=null;console.log('PASS: Excel preview, worksheets, header detection, conflict protection, import, lookup, attendance, restart persistence, duplicate detection, automatic IDs, cancel, calendar entry point.');
}
main().catch(async error=>{console.error(error);if(application)await application.close();process.exitCode=1;});
