// Fictitious records and disposable storage only; the user's lists are never edited.
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),data=path.join(root,'tmp','combine-smoke-'+Date.now());fs.mkdirSync(path.join(data,'lists'),{recursive:true});
const p=(id,givenNames,paternalSurname='',maternalSurname='')=>({id,givenNames,paternalSurname,maternalSurname,sponsor:'Padrino de ejemplo '+id,notes:''});
const first={date:'2026-10-18',title:'Primer encuentro',people:[p(50,'Ana','Zúñiga'),p(7,'Luis','Álvarez','B'),p(9,'Marta','Núñez'),p(8,'Nora','Ñáñez'),...Array.from({length:10},(_,i)=>p(100+i,'Persona de ejemplo','Ortiz',String(i)))],attendance:{50:{confirmand:true},7:{confirmand:true},9:{sponsor:true},8:{confirmand:true},...Object.fromEntries(Array.from({length:10},(_,i)=>[100+i,{confirmand:true}]))}};
const second={date:'2026-10-19',title:'Segundo encuentro',people:[p(50,'Ana','Zúñiga'),p(7,'Luis','Álvarez','B'),p(20,'Ximena','Álvarez','A'),p(3,'Paula','Nava'),p(22,'Persona sin apellidos')],attendance:{50:{confirmand:true},7:{confirmand:true},20:{confirmand:true},3:{confirmand:true},22:{confirmand:true}}};
for(const l of [first,second])fs.writeFileSync(path.join(data,'lists',l.date+'.json'),JSON.stringify(l));
const originalFiles=[first,second].map(l=>fs.readFileSync(path.join(data,'lists',l.date+'.json'),'utf8'));
let application;const errors=[];
async function launch(){const env={...process.env,SAGRARIO_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;application=await electron.launch({...(process.env.SAGRARIO_TEST_EXE?{executablePath:process.env.SAGRARIO_TEST_EXE,args:[]}:{args:[root]}),env,timeout:60000});const page=await application.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.getByRole('heading',{name:'Registro de asistencia',exact:true}).waitFor();return page;}
async function main(){
 let page=await launch();await page.getByRole('button',{name:'Combinar dos listas',exact:true}).click();
 await page.getByText('16 integrantes en la nueva lista',{exact:true}).waitFor();assert.equal(await page.locator('#combine-preview tbody tr').count(),12);
 await page.locator('#combine-date').fill('2026-10-18');assert.equal(await page.locator('#combine-save').isEnabled(),false);
 await page.locator('#combine-date').fill('2026-10-20');await page.locator('#combine-title').fill('Reunión de asistentes');
 await page.screenshot({path:path.join(root,'tmp','combine-preview.png')});
 await page.locator('#combine-save').click();await page.locator('#modal').waitFor({state:'hidden'});await page.getByRole('heading',{name:'Reunión de asistentes',exact:true}).waitFor();
 const get=()=>page.evaluate(()=>window.sagrario.getList('2026-10-20'));
 const combined=await get(),alphabetic=[20,7,3,8,...Array.from({length:10},(_,i)=>100+i),50,22];assert.deepEqual(combined.people.map(p=>p.id),alphabetic);assert.ok(Object.values(combined.attendance).every(a=>!a.confirmand&&!a.sponsor&&!a.notes));
 await page.getByRole('button',{name:'Ordenar y mover',exact:false}).click();await page.locator('#order-next').click();await page.getByRole('button',{name:'Subir registro 104',exact:true}).click();assert.equal(await page.locator('#order-position').inputValue(),'8');
 await page.getByRole('button',{name:'A–Z por apellido',exact:true}).click();await page.locator('#order-search').fill('50');await page.getByRole('button',{name:'Seleccionar a Ana Zúñiga',exact:true}).click();
 await page.locator('#order-position').fill('1');await page.locator('#order-move').click();await page.locator('#order-search').fill('');await page.screenshot({path:path.join(root,'tmp','reorder-preview.png')});
 await page.locator('#order-save').click();await page.locator('#modal').waitFor({state:'hidden'});const moved=[50,...alphabetic.filter(id=>id!==50)];assert.deepEqual((await get()).people.map(p=>p.id),moved);
 await page.getByRole('checkbox',{name:'Asistencia confirmando 50',exact:true}).check();await page.getByRole('checkbox',{name:'Asistencia padrino 50',exact:true}).check();
 await page.getByRole('button',{name:'Editar registro 50',exact:true}).click();await page.locator('[name=dailyNotes]').fill('Conservar al mover');await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
 assert.deepEqual((await get()).people.map(p=>p.id),moved);
 await application.close();page=await launch();await page.locator('#date-select').selectOption('2026-10-20');await page.getByRole('heading',{name:'Reunión de asistentes',exact:true}).waitFor();
 assert.deepEqual((await get()).people.map(p=>p.id),moved);assert.deepEqual((await get()).attendance[50],{confirmand:true,sponsor:true,notes:'Conservar al mover'});
 await page.getByRole('button',{name:'Ordenar y mover',exact:false}).click();await page.getByRole('button',{name:'A–Z por apellido',exact:true}).click();await page.getByRole('button',{name:'Cancelar',exact:true}).click();assert.deepEqual((await get()).people.map(p=>p.id),moved);
 const csvPath=path.join(data,'orden.csv');await application.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},csvPath);await page.getByRole('button',{name:'Excel / CSV',exact:false}).click();await page.getByRole('status').filter({hasText:csvPath}).waitFor();assert.ok(fs.readFileSync(csvPath,'utf8').split('\r\n')[1].startsWith('"2026-10-20","50"'));
 await page.getByRole('button',{name:'Listas y calendario',exact:false}).click();await page.getByRole('button',{name:'Combinar dos listas',exact:true}).click();await page.locator('#combine-first').selectOption('2026-10-18');await page.locator('#combine-second').selectOption('2026-10-18');await page.getByText('Selecciona dos listas de fechas diferentes.',{exact:true}).waitFor();assert.equal(await page.locator('#combine-save').isEnabled(),false);await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 for(const [index,l] of [first,second].entries())assert.equal(fs.readFileSync(path.join(data,'lists',l.date+'.json'),'utf8'),originalFiles[index]);
 await page.evaluate(async()=>{const source=await window.sagrario.getList('2026-10-19');const record={...source.people.find(p=>p.id===50),givenNames:'Beatriz'};await window.sagrario.editPerson({date:source.date,record,dailyNotes:''});});
 await page.getByRole('button',{name:'Combinar dos listas',exact:true}).click();await page.locator('#combine-first').selectOption('2026-10-18');await page.locator('#combine-second').selectOption('2026-10-19');await page.getByRole('combobox',{name:'Resolver número 50',exact:true}).waitFor();
 await page.locator('#combine-date').fill('2026-10-21');assert.equal(await page.locator('#combine-save').isEnabled(),false);
 await page.getByRole('combobox',{name:'Resolver número 50',exact:true}).selectOption('both');await page.getByText('17 integrantes en la nueva lista',{exact:true}).waitFor();
 await page.locator('#combine-title').fill('Coincidencias revisadas');await page.locator('#combine-save').click();await page.locator('#modal').waitFor({state:'hidden'});
 const resolved=await page.evaluate(()=>window.sagrario.getList('2026-10-21'));assert.equal(resolved.people.length,17);assert.equal(resolved.people.find(p=>p.id===110).givenNames,'Beatriz');
 assert.deepEqual(errors,[]);await application.close();application=null;
 console.log('PASS: combine two dates using confirmand attendance, deduplicate and sort surnames, protect dates, move across pages/by exact position, preserve IDs and attendance through edits/restart, cancel changes, export saved order, calendar entry point.');
}
main().catch(async error=>{console.error(error);if(application)await application.close();process.exitCode=1;});
