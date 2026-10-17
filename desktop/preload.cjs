const {contextBridge,ipcRenderer}=require('electron');
const call=channel=>async(...args)=>{const result=await ipcRenderer.invoke(channel,...args);if(!result.ok)throw Error(result.error);return result.value;};
contextBridge.exposeInMainWorld('sagrario',{
  init:call('init'),getList:call('get-list'),attendance:call('attendance'),editPerson:call('edit-person'),
  createList:call('create-list'),createYear:call('create-year'),export:call('export'),backup:call('backup'),restore:call('restore'),
  openExcel:call('excel-open'),excelInfo:call('excel-info'),previewExcel:call('excel-preview'),importExcel:call('excel-import'),discardExcel:call('excel-discard'),
  checkUpdates:call('updates-check'),downloadUpdate:call('updates-download'),installUpdate:call('updates-install'),
  openRepo:call('open-repo'),openData:call('open-data'),
  onUpdate:callback=>{const listener=(_event,status)=>callback(status);ipcRenderer.on('update-status',listener);return()=>ipcRenderer.removeListener('update-status',listener);}
});
