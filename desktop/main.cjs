const {app,BrowserWindow,ipcMain,dialog,protocol,net,session,shell} = require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {Store}=require('./store.cjs');
const {csv,printHTML}=require('./export.cjs');
const {autoUpdater}=require('electron-updater');
const {ExcelImport}=require('./excel.cjs');
const excelImport=new ExcelImport();

protocol.registerSchemesAsPrivileged([{scheme:'sagrario',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
if(process.env.SAGRARIO_TEST_DATA) app.setPath('userData',process.env.SAGRARIO_TEST_DATA);
let win,store,update={status:'idle',message:'Busca nuevas versiones en GitHub.'};
const locked=app.requestSingleInstanceLock();
if(!locked) app.quit();
else {
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
app.whenReady().then(async()=>{
  app.setAppUserModelId('mx.sagrario.asistencias');
  protocol.handle('sagrario',request=>{
    const url=new URL(request.url);
    const allowed={'/index.html':'index.html','/app.js':'app.js','/import.js':'import.js','/combine.js':'combine.js','/ordering.js':'ordering.js','/style.css':'style.css'};
    if(url.hostname!=='app' || !allowed[url.pathname]) return new Response('Not found',{status:404});
    return net.fetch(pathToFileURL(path.join(__dirname,'../src',allowed[url.pathname])).toString());
  });
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  const seedPath=path.join(__dirname,'../data/seed.json');
  const seed=JSON.parse(fs.readFileSync(fs.existsSync(seedPath)?seedPath:path.join(__dirname,'../data/seed.example.json'),'utf8'));
  try {store=new Store(app.getPath('userData'),seed);} catch(error){dialog.showErrorBox('No se pudieron abrir las listas','Los archivos se conservaron. Restaura un respaldo antes de continuar.\n'+error.message);app.quit();return;}
  registerIPC(); setupUpdates();
  win=new BrowserWindow({width:1420,height:920,minWidth:1024,minHeight:700,title:'Sagrario · Asistencias',backgroundColor:'#f4f7fb',icon:path.join(__dirname,'../assets/icon.png'),autoHideMenuBar:true,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(url!=='sagrario://app/index.html')event.preventDefault();});
  await win.loadURL('sagrario://app/index.html');
  win.once('closed',()=>{win=null;});
  win.show();
}).catch(error=>{dialog.showErrorBox('Sagrario',error.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
}
function handle(channel,fn) {
  ipcMain.handle(channel,async(event,...args)=>{
    if(event.sender!==win?.webContents || event.senderFrame!==win.webContents.mainFrame || event.senderFrame.url!=='sagrario://app/index.html') throw Error('Origen no autorizado.');
    try{return {ok:true,value:await fn(...args)};}catch(error){return {ok:false,error:error.message};}
  });
}
function sendUpdate(status,message,extra={}) {update={status,message,...extra};win?.webContents.send('update-status',update);return update;}
function setupUpdates(){
  autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=false;
  autoUpdater.on('checking-for-update',()=>sendUpdate('checking','Buscando nuevas versiones…'));
  autoUpdater.on('update-available',info=>sendUpdate('available',`La versión ${info.version} está disponible.`,{version:info.version}));
  autoUpdater.on('update-not-available',()=>sendUpdate('current','Tienes la versión más reciente.'));
  autoUpdater.on('download-progress',p=>sendUpdate('downloading',`Descargando actualización: ${Math.round(p.percent)} %`));
  autoUpdater.on('update-downloaded',()=>sendUpdate('downloaded','La actualización está lista. Puedes instalarla cuando termines.'));
  autoUpdater.on('error',()=>sendUpdate('error','No se pudo consultar o descargar la actualización. Revisa tu conexión y los lanzamientos de GitHub.'));
}
function registerIPC(){
  handle('init',()=>({lists:store.list(),version:app.getVersion(),dataPath:app.getPath('userData'),update}));
  handle('get-list',date=>store.get(date));
  handle('attendance',args=>store.attendance(args));
  handle('edit-person',args=>store.edit(args));
  handle('create-list',args=>store.create(args));
  handle('create-year',args=>store.year(args));
  handle('preview-combined',args=>store.previewCombined(args));
  handle('create-combined',args=>store.createCombined(args));
  handle('reorder-list',args=>store.reorder(args));
  handle('excel-open',async()=>{
    const result=await dialog.showOpenDialog(win,{title:'Importar lista desde Excel',filters:[{name:'Excel y CSV',extensions:['xlsx','xls','csv']}],properties:['openFile']});
    if(result.canceled)return {canceled:true};
    return excelImport.open(result.filePaths[0]);
  });
  handle('excel-info',args=>excelImport.info(args));
  handle('excel-preview',args=>excelImport.preview(args));
  handle('excel-import',args=>excelImport.commit(args,store));
  handle('excel-discard',token=>excelImport.discard(token));
  handle('export',async({date,format})=>{
    if(!['csv','pdf'].includes(format))throw Error('Formato inválido.');
    const list=store.get(date);
    const result=await dialog.showSaveDialog(win,{title:format==='pdf'?'Guardar lista en PDF':'Guardar lista para Excel',defaultPath:path.join(app.getPath('documents'),`Asistencia-${date}.${format}`),filters:[{name:format.toUpperCase(),extensions:[format]}]});
    if(result.canceled)return {canceled:true};
    if(format==='csv')fs.writeFileSync(result.filePath,csv(list),'utf8');
    else {
      const printWin=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
      try {await printWin.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(printHTML(list)));const pdf=await printWin.webContents.printToPDF({printBackground:true,landscape:true,pageSize:'Letter',preferCSSPageSize:true});fs.writeFileSync(result.filePath,pdf);}finally{printWin.destroy();}
    }
    return {path:result.filePath};
  });
  handle('backup',async()=>{
    const result=await dialog.showSaveDialog(win,{title:'Guardar respaldo de todas las listas',defaultPath:path.join(app.getPath('documents'),`Sagrario-respaldo-${new Date().toISOString().slice(0,10)}.json`),filters:[{name:'Respaldo Sagrario',extensions:['json']}]});
    if(result.canceled)return {canceled:true};fs.writeFileSync(result.filePath,JSON.stringify(store.backup()),'utf8');return {path:result.filePath};
  });
  handle('restore',async()=>{
    const result=await dialog.showOpenDialog(win,{title:'Seleccionar respaldo',filters:[{name:'Respaldo Sagrario',extensions:['json']}],properties:['openFile']});
    if(result.canceled)return {canceled:true};
    if(fs.statSync(result.filePaths[0]).size>150*1024*1024)throw Error('El respaldo excede el límite de 150 MB.');
    const input=JSON.parse(fs.readFileSync(result.filePaths[0],'utf8'));
    const response=await dialog.showMessageBox(win,{type:'question',title:'Restaurar listas',message:'Las fechas del respaldo reemplazarán sus listas actuales. Las otras fechas se conservarán.',detail:'Se guardará una copia automática del estado anterior en esta computadora.',buttons:['Cancelar','Restaurar'],defaultId:0,cancelId:0});
    if(response.response!==1)return {canceled:true};return store.restore(input);
  });
  handle('updates-check',async()=>{if(!app.isPackaged)return sendUpdate('dev','Las actualizaciones se consultan desde la aplicación instalada.');if(['checking','downloading','downloaded'].includes(update.status))return update;try{await autoUpdater.checkForUpdates();}catch{}return update;});
  handle('updates-download',async()=>{if(update.status!=='available')throw Error('Primero busca una actualización.');sendUpdate('downloading','Preparando descarga…');await autoUpdater.downloadUpdate();return update;});
  handle('updates-install',()=>{if(update.status!=='downloaded')throw Error('La actualización aún no está descargada.');setTimeout(()=>autoUpdater.quitAndInstall(false,true),500);return true;});
  handle('open-repo',()=>shell.openExternal('https://github.com/sistemascalc/sagrario-asistencias'));
  handle('open-data',()=>shell.openPath(app.getPath('userData')));
}
