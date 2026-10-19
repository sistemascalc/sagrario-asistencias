// Fictitious records and disposable storage; never edits the user's saved lists.
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),data=path.join(root,'tmp','attendance-smoke-'+Date.now()),date='2026-10-18';
fs.mkdirSync(path.join(data,'lists'),{recursive:true});
const person=(id,givenNames,paternalSurname,maternalSurname,sponsor)=>({id,givenNames,paternalSurname,maternalSurname,sponsor,notes:''});
const fixture={date,title:'Catequesis · grupo de ejemplo',people:[person(1,'Mariana','Álvarez','García','Carlos Ruiz'),person(2,'Luis','Hernández','Soto','Ana Pérez'),person(3,'Sofía','Mendoza','Ríos','Elena Vargas'),person(4,'Diego','Torres','López','José Morales')],attendance:{1:{notes:'Nota que debe conservarse'},2:{confirmand:true},3:{confirmand:true,sponsor:true},4:{sponsor:true}}};
fs.writeFileSync(path.join(data,'lists',date+'.json'),JSON.stringify(fixture));
let application,page;const errors=[];
async function launch(){
  const env={...process.env,SAGRARIO_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
  application=await electron.launch({...(process.env.SAGRARIO_TEST_EXE?{executablePath:process.env.SAGRARIO_TEST_EXE,args:[]}:{args:[root]}),env,timeout:60000});
  page=await application.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.getByRole('heading',{name:'Registro de asistencia',exact:true}).waitFor();
}
const check=(id,role)=>page.locator('.check[data-id="'+id+'"][data-role="'+role+'"]');
const get=()=>page.evaluate(date=>window.sagrario.getList(date),date);
async function state(id,confirmand,sponsor){
  await page.waitForFunction(({id,confirmand,sponsor})=>{
    const c=document.querySelector('.check[data-id="'+id+'"][data-role="confirmand"]'),s=document.querySelector('.check[data-id="'+id+'"][data-role="sponsor"]'),b=document.querySelector('.check[data-id="'+id+'"][data-role="both"]');
    return c&&!c.disabled&&c.checked===confirmand&&s.checked===sponsor&&b.checked===(confirmand&&sponsor)&&b.indeterminate===(confirmand!==sponsor);
  },{id,confirmand,sponsor});
  const attendance=(await get()).attendance[id];assert.equal(attendance.confirmand,confirmand);assert.equal(attendance.sponsor,sponsor);
}
async function main(){
  await launch();await state(1,false,false);await state(2,true,false);await state(3,true,true);await state(4,false,true);
  await page.screenshot({path:path.join(root,'tmp','attendance-checkboxes.png')});
  await check(1,'both').click();await state(1,true,true);
  await check(1,'confirmand').uncheck();await state(1,false,true);
  await check(1,'both').click();await state(1,true,true);
  await check(1,'sponsor').uncheck();await state(1,true,false);
  await check(1,'both').click();await state(1,true,true);
  await check(1,'both').uncheck();await state(1,false,false);
  await check(1,'both').focus();await page.keyboard.press('Space');await state(1,true,true);
  await page.keyboard.press('Space');await state(1,false,false);
  assert.equal((await get()).attendance[1].notes,'Nota que debe conservarse');
  await page.getByRole('button',{name:'Editar registro 1',exact:true}).click();
  const both=page.getByRole('checkbox',{name:'Ambos presentes',exact:true}),confirmand=page.getByRole('checkbox',{name:'Confirmando presente',exact:true}),sponsor=page.getByRole('checkbox',{name:'Padrino presente',exact:true});
  await both.check();assert.ok(await confirmand.isChecked());assert.ok(await sponsor.isChecked());
  await sponsor.uncheck();assert.equal(await both.evaluate(el=>el.indeterminate),true);
  await both.click();assert.ok(await confirmand.isChecked());assert.ok(await sponsor.isChecked());
  await page.screenshot({path:path.join(root,'tmp','attendance-both-editor.png')});
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});await state(1,true,true);
  await page.getByRole('button',{name:'Ambos presentes',exact:true}).click();assert.equal(await page.locator('.attendance-table tbody tr').count(),2);
  await page.getByRole('button',{name:'Pendientes',exact:true}).click();assert.equal(await page.locator('.attendance-table tbody tr').count(),2);
  await check(2,'both').click();await check(2,'both').waitFor({state:'detached'});assert.equal(await page.locator('.attendance-table tbody tr').count(),1);
  await page.getByRole('button',{name:'Todos',exact:true}).click();await state(2,true,true);
  await page.getByRole('button',{name:'Editar registro 4',exact:true}).click();await both.click();await page.getByRole('button',{name:'Cancelar',exact:true}).click();await state(4,false,true);
  await application.close();await launch();await state(1,true,true);await state(2,true,true);await state(4,false,true);
  assert.equal((await get()).attendance[1].notes,'Nota que debe conservarse');
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1024,700));
  await page.screenshot({path:path.join(root,'tmp','attendance-checkboxes-small.png')});
  const viewport=await page.locator('.attendance-table').evaluate(table=>({table:table.getBoundingClientRect().width,scroll:table.parentElement.scrollWidth,visible:table.parentElement.clientWidth,body:document.body.scrollWidth,viewport:window.innerWidth}));
  assert.ok(viewport.table>=940);assert.ok(viewport.scroll>viewport.visible);assert.ok(viewport.body<=viewport.viewport);
  await page.getByRole('button',{name:'Nueva lista',exact:false}).click();await page.locator('[name=date]').fill('2026-10-19');await page.getByRole('button',{name:'Crear lista',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
  const next=await page.evaluate(()=>window.sagrario.getList('2026-10-19'));assert.ok(Object.values(next.attendance).every(a=>!a.confirmand&&!a.sponsor));assert.equal((await get()).attendance[1].confirmand,true);
  assert.deepEqual(errors,[]);await application.close();application=null;
  console.log('PASS: Both checkbox marks/clears together; partial state synchronizes; individual marks, keyboard, editor, cancel, filters, notes, persistence and new dates work; narrow window scrolls within the table.');
}
main().catch(async error=>{console.error(error);if(application)await application.close();process.exitCode=1;});
