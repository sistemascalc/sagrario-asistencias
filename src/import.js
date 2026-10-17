function importExcelModal(){
  let workbook=null,info=null,preview=null,revision=0,working=false;
  const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  const labels={id:'Número de registro',givenNames:'Nombre(s) o nombre completo',paternalSurname:'Apellido paterno / apellidos',maternalSurname:'Apellido materno',sponsor:'Padrino / madrina',notes:'Observaciones'};
  showModal(`<form id="excel-form"><div class="modal-head"><div><div class="eyebrow">Tus listas, en un solo lugar</div><h2>Importar desde Excel</h2><p>Revisa los datos antes de crear una nueva lista.</p></div><button type="button" class="button ghost" data-close aria-label="Cerrar">✕</button></div><div class="modal-body"><div class="excel-file-card"><div class="excel-file-icon" aria-hidden="true">▦</div><div><strong id="excel-file-name">Selecciona tu lista</strong><p>Excel (.xlsx, .xls) o CSV · Hasta 10 MB y 10,000 personas</p></div><button type="button" class="button primary" id="excel-choose">Elegir archivo</button></div><div id="excel-intro" class="callout">Incluye una fila con los títulos de las columnas, como <strong>Número, Nombre, Apellido paterno, Apellido materno, Padrino y Observaciones</strong>. También puedes usar una sola columna con el nombre completo. Si el archivo no tiene números, podemos asignarlos.</div><p id="excel-error" class="error-text" role="alert"></p><div id="excel-config" hidden><h3 class="import-section-title">1. Fecha y origen de la lista</h3><div class="form-grid"><label class="field">Fecha de asistencia<input id="excel-date" type="date" required min="1900-01-01" max="2199-12-31" value="${today}"></label><label class="field">Nombre de la lista<input id="excel-title" maxlength="300" required></label><label class="field">Hoja del archivo<select id="excel-sheet"></select></label><label class="field">Fila con los títulos de las columnas<input id="excel-header" type="number" min="1" max="200" required><small>Las personas deben estar debajo de esta fila.</small></label></div><p id="excel-date-error" class="error-text" role="alert"></p><h3 class="import-section-title">2. Relaciona las columnas</h3><div id="excel-mapping" class="form-grid import-mapping"></div><label class="import-numbering"><input type="checkbox" class="check" id="excel-auto"> Asignar números automáticamente desde el 1</label><p class="help-text">El nombre es obligatorio. Los apellidos, el padrino y las observaciones son opcionales. Las palomitas de asistencia y las notas del día comenzarán en blanco.</p><h3 class="import-section-title">3. Revisa la vista previa</h3><div id="excel-preview" aria-live="polite"></div></div></div><div class="modal-footer"><span id="excel-ready" class="help-text">El archivo se procesa en esta computadora.</span><button type="button" class="button" data-close>Cancelar</button><button type="submit" class="button primary" id="excel-save" disabled>Importar lista</button></div></form>`);
  const dialog=$('#modal'),form=$('#excel-form');dialog.classList.add('import-dialog');
  const alive=()=>dialog.open&&form.isConnected;
  dialog.addEventListener('close',()=>{revision++;dialog.classList.remove('import-dialog');if(workbook)void api.discardExcel(workbook.token).catch(()=>{});},{once:true});
  function args(){return {token:workbook.token,sheetIndex:Number($('#excel-sheet').value),headerRow:Number($('#excel-header').value),mapping:Object.fromEntries(Object.keys(labels).map(key=>[key,Number($(`#excel-map-${key}`).value)])),autoNumber:$('#excel-auto').checked};}
  function saveState(){
    if(!alive())return;
    const date=$('#excel-date').value,collision=meta.lists.some(l=>l.date===date);
    $('#excel-date-error').textContent=collision?'Ya existe una lista en esta fecha. Elige otro día para conservar sus datos y asistencias.':'';
    $('#excel-save').disabled=working||!preview?.valid||!date||!$('#excel-title').value.trim()||collision;
  }
  function mappingControls(){
    $('#excel-mapping').innerHTML=Object.entries(labels).map(([key,label])=>`<label class="field">${label}${key==='givenNames'?' *':''}<select id="excel-map-${key}" aria-label="Columna: ${label}"><option value="-1">${key==='id'||key==='givenNames'?'Selecciona una columna':'No importar este dato'}</option>${info.columns.map(c=>`<option value="${c.index}" ${info.mapping[key]===c.index?'selected':''}>${e(c.label)}</option>`).join('')}</select></label>`).join('');
    $('#excel-map-id').disabled=$('#excel-auto').checked;
    form.querySelectorAll('[id^=excel-map-]').forEach(select=>select.onchange=review);
  }
  async function review(){
    const seq=++revision;preview=null;saveState();$('#excel-preview').classList.remove('error-text');$('#excel-preview').textContent='Revisando todas las filas…';$('#excel-ready').textContent='Revisión en curso…';
    try {
      const result=await api.previewExcel(args());
      if(!alive()||seq!==revision)return;
      preview=result;
      const errors=result.errorCount?`<div class="import-errors"><strong>Corrige ${result.errorCount} ${result.errorCount===1?'problema':'problemas'} antes de importar.</strong><ul>${result.errors.map(error=>`<li>${e(error)}</li>`).join('')}</ul>${result.errorCount>result.errors.length?'<p>Se muestran los primeros 30 problemas.</p>':''}<p>Revisa las columnas seleccionadas o corrige el archivo y vuelve a elegirlo.</p></div>`:'';
      $('#excel-preview').innerHTML=`<div class="import-summary ${result.valid?'valid':''}"><strong>${result.total} personas encontradas</strong><span>${result.blankRows?`${result.blankRows} filas vacías omitidas · `:''}${result.withoutSponsor} sin padrino registrado</span></div>${errors}${result.people.length?`<div class="table-wrap import-table"><table><thead><tr><th>Núm.</th><th>Confirmando</th><th>Padrino / madrina</th><th>Observaciones</th></tr></thead><tbody>${result.people.map(p=>`<tr><td>${p.id}</td><td>${e(fullName(p))}</td><td>${e(p.sponsor)||'—'}</td><td>${e(p.notes)||'—'}</td></tr>`).join('')}</tbody></table></div><p class="help-text">Vista previa de ${result.people.length} registros válidos. Se revisaron todas las filas del archivo.</p>`:''}`;
      $('#excel-ready').textContent=result.valid?`${result.total} personas listas para importar`:'Revisa los datos indicados';saveState();
    }catch(error){if(alive()&&seq===revision){$('#excel-preview').textContent=error.message;$('#excel-preview').classList.add('error-text');$('#excel-ready').textContent='Relaciona las columnas para continuar';saveState();}}
  }
  async function changeSheet(headerChanged=false){
    const seq=++revision;preview=null;saveState();$('#excel-preview').textContent='Leyendo encabezados…';
    try {
      const next=await api.excelInfo({token:workbook.token,sheetIndex:Number($('#excel-sheet').value),...(headerChanged?{headerRow:Number($('#excel-header').value)}:{})});
      if(!alive()||seq!==revision)return;
      info=next;$('#excel-header').value=info.headerRow;$('#excel-header').max=info.maxHeaderRow;
      mappingControls();await review();
    }catch(error){if(alive()&&seq===revision){$('#excel-preview').textContent=error.message;saveState();}}
  }
  $('#excel-choose').onclick=async()=>{
    if(working)return;working=true;saveState();const choose=$('#excel-choose');choose.disabled=true;choose.textContent='Abriendo…';$('#excel-error').textContent='';
    try {
      const result=await api.openExcel();
      if(!alive()){if(!result.canceled)await api.discardExcel(result.token);return;}
      if(result.canceled)return;
      workbook=result;info=result;preview=null;modalDirty=true;
      $('#excel-file-name').textContent=result.fileName;$('#excel-config').hidden=false;$('#excel-intro').hidden=true;
      $('#excel-title').value=result.fileName.replace(/\.[^.]+$/,'').slice(0,300);
      $('#excel-sheet').innerHTML=result.sheets.map((name,index)=>`<option value="${index}" ${index===info.sheetIndex?'selected':''}>${e(name)}</option>`).join('');
      $('#excel-header').value=info.headerRow;$('#excel-header').max=info.maxHeaderRow;$('#excel-auto').checked=false;mappingControls();await review();
    }catch(error){if(alive()){workbook=null;preview=null;$('#excel-config').hidden=true;$('#excel-error').textContent=error.message;$('#excel-ready').textContent='Selecciona un archivo válido';}}
    finally{working=false;if(alive()){choose.disabled=false;choose.textContent=workbook?'Cambiar archivo':'Elegir archivo';saveState();}}
  };
  $('#excel-sheet').onchange=()=>changeSheet();$('#excel-header').onchange=()=>changeSheet(true);
  $('#excel-auto').onchange=()=>{$('#excel-map-id').disabled=$('#excel-auto').checked;review();};
  $('#excel-date').oninput=saveState;$('#excel-title').oninput=saveState;
  form.onsubmit=async event=>{
    event.preventDefault();if(working||$('#excel-save').disabled)return;
    working=true;saveState();$('#excel-save').textContent='Importando…';$('#excel-error').textContent='';
    form.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
    try {
      const result=await mutation(()=>api.importExcel({...args(),date:$('#excel-date').value,title:$('#excel-title').value.trim()}));
      modalDirty=false;dialog.close();await openList(result.date);toast(`${result.total} personas importadas. La lista está lista para tomar asistencia.`);
    }catch(error){if(alive()){$('#excel-error').textContent=error.message;form.querySelectorAll('input,select,button').forEach(el=>el.disabled=false);$('#excel-map-id').disabled=$('#excel-auto').checked;}}
    finally{working=false;if(alive()){$('#excel-save').textContent='Importar lista';saveState();}}
  };
}
