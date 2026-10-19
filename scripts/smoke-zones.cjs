const {_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),date='2026-10-25',data=path.join(root,'tmp','zones-smoke-'+Date.now());
const {Store}=require('../desktop/store.cjs'),{layout}=require('../desktop/seating.cjs');
const store=new Store(data,{date,title:'Grupo de ejemplo',people:Array.from({length:22},(_,i)=>({id:i+1,givenNames:'Persona de ejemplo '+(i+1),paternalSurname:'Apellido',maternalSurname:'',sponsor:'Padrino de ejemplo '+(i+1),notes:'Conservar'})),attendance:{1:{confirmand:true,sponsor:true,notes:'Conservar nota'}}});
const preview=store.previewSeating({date});store.saveSeating({date,revision:preview.revision,assignments:preview.seating.assignments});const before=store.get(date);
let app,page;const errors=[];
async function launch(){const env={...process.env,SAGRARIO_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;app=await _electron.launch({...(process.env.SAGRARIO_TEST_EXE?{executablePath:process.env.SAGRARIO_TEST_EXE,args:[]}:{args:[root]}),env});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.getByRole('heading',{name:'Registro de asistencia',exact:true}).waitFor();}
async function open(){await page.locator('#seat-list').click();await page.getByRole('heading',{name:'Bancas y padrinos',exact:true}).waitFor();}
async function save(){await page.locator('#seating-save').click();await page.locator('#modal').waitFor({state:'hidden'});}
const get=()=>page.evaluate(date=>window.sagrario.getList(date),date);
(async()=>{
 await launch();await open();assert.equal(await page.locator('[data-zone-select]').count(),9);const leaders={};
 for(const z of layout.zones){
  await page.locator(`[data-zone-select="${z.number}"]`).click();assert.equal(await page.locator('[data-leader-slot]').count(),3);
  leaders[z.number]=[1,2,3].map(i=>`Responsable ${i} de zona ${z.number} · María & José`);
  for(let i=0;i<3;i++)await page.locator(`[data-leader-slot="${i}"]`).fill(leaders[z.number][i]);
  const b=layout.benches.find(b=>b.zone===z.number),rgb=z.color.slice(1).match(/../g).map(x=>parseInt(x,16)).join(', ');
  assert.equal(await page.locator(`[data-bench="${b.number}"]`).evaluate(el=>getComputedStyle(el).backgroundColor),`rgb(${rgb})`);
 }
 assert.equal(await page.locator('#seating-pdf').isEnabled(),false);await page.locator('[data-zone-select="1"]').click();await page.screenshot({path:path.join(root,'tmp/zones-editor.png')});await save();
 const saved=await get();assert.deepEqual(saved.seating.zoneLeaders,leaders);assert.deepEqual(saved.people,before.people);assert.deepEqual(saved.attendance,before.attendance);assert.deepEqual(saved.seating.assignments,before.seating.assignments);
 await app.close();await launch();await open();await page.locator('[data-zone-select="9"]').click();assert.equal(await page.locator('[data-leader-slot="2"]').inputValue(),leaders[9][2]);
 await page.locator('[data-leader-slot="0"]').fill('Sin guardar');await page.getByRole('button',{name:'Cancelar',exact:true}).click();assert.deepEqual((await get()).seating.zoneLeaders,leaders);
 await open();await page.locator('#seat-person').selectOption('1');await page.locator('#seat-bench').selectOption('141');await page.locator('#seat-pair').selectOption('1');await page.locator('#seat-move').click();await save();
 await page.locator('#search').fill('1');await page.locator('#table-area').getByText('Zona 8 · Naranja',{exact:true}).waitFor();await page.screenshot({path:path.join(root,'tmp/zones-registration.png')});
 await open();await page.locator('#seating-auto').click();await page.getByText('Cambios de bancas o encargados sin guardar',{exact:true}).waitFor();await save();assert.deepEqual((await get()).seating.zoneLeaders,leaders);
 await open();const pdf=path.join(root,'tmp/zones-test.pdf');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},pdf);await page.locator('#seating-pdf').click();await page.getByRole('status').filter({hasText:pdf}).waitFor({timeout:60000});assert.ok(fs.statSync(pdf).size>10000);
 const csv=path.join(root,'tmp/zones-test.csv');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},csv);await page.locator('#seating-csv').click();await page.getByRole('status').filter({hasText:csv}).waitFor();assert.ok(fs.readFileSync(csv,'utf8').includes(leaders[1][0]));
 assert.deepEqual(errors,[]);await app.close();app=null;console.log('PASS: Nine original colors, 27 leaders, save/restart/cancel, pair movement, reassignment preservation, registration badge, PDF and CSV.');
})().catch(async error=>{console.error(error);if(app)await app.close();process.exitCode=1;});
