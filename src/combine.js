function combineListsModal(){
  let preview=null,sequence=0,working=false;
  const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  const second=meta.lists.find(l=>l.date!==list.date)?.date||'';
  showModal(`<form id="combine-form"><div class="modal-head"><div><div class="eyebrow">Un nuevo encuentro con quienes asistieron</div><h2>Combinar dos listas</h2><p>Crea una lista nueva, ordenada alfabéticamente por apellido.</p></div><button type="button" class="button ghost" data-close aria-label="Cerrar">✕</button></div><div class="modal-body"><div class="callout">Se incluirá a cada <strong>confirmando que asistió al menos a una de las dos fechas</strong>, junto con su padrino. La nueva asistencia y las notas del día comenzarán en blanco. Las listas originales conservarán todos sus datos.</div><div class="form-grid"><label class="field">Primera lista<select id="combine-first">${listOptions(list.date)}</select></label><label class="field">Segunda lista<select id="combine-second"><option value="">Selecciona otra fecha</option>${listOptions(second)}</select></label><label class="field">Fecha de la nueva lista<input id="combine-date" type="date" required min="1900-01-01" max="2199-12-31" value="${today}"></label><label class="field">Nombre de la nueva lista<input id="combine-title" required maxlength="300" value="Asistentes de catequesis"></label></div><p id="combine-date-error" class="error-text" role="alert"></p><p class="help-text">Cada lista corresponde a un grupo distinto. Se conservan todos sus asistentes, aunque coincidan sus números o nombres. Primero se ordenan por apellido paterno, materno y nombre; después reciben números nuevos: 1, 2, 3…</p><div class="combine-preview-heading"><h3 class="import-section-title">Revisa a los integrantes</h3><button type="button" class="button small" id="combine-refresh">↻ Revisar de nuevo</button></div><div id="combine-preview" aria-live="polite"></div><p id="combine-error" class="error-text" role="alert"></p></div><div class="modal-footer"><span id="combine-ready" class="help-text">Selecciona dos listas diferentes.</span><button type="button" class="button" data-close>Cancelar</button><button type="submit" class="button primary" id="combine-save" disabled>Crear lista con asistentes</button></div></form>`);
  const dialog=$('#modal'),form=$('#combine-form');dialog.classList.add('combine-dialog');
  dialog.addEventListener('close',()=>{sequence++;dialog.classList.remove('combine-dialog');},{once:true});
  const alive=()=>dialog.open&&form.isConnected;
  const args=()=>({sourceDates:[$('#combine-first').value,$('#combine-second').value]});
  function saveState(){
    if(!alive())return;
    const date=$('#combine-date').value,collision=meta.lists.some(l=>l.date===date);
    $('#combine-date-error').textContent=collision?'Ya existe una lista para ese día. Selecciona otra fecha para conservar sus datos.':'';
    $('#combine-save').disabled=working||!preview||!preview.total||preview.total>10000||collision||!date||!$('#combine-title').value.trim();
  }
  async function review(){
    const seq=++sequence;preview=null;saveState();$('#combine-error').textContent='';$('#combine-preview').textContent='Revisando las asistencias…';$('#combine-ready').textContent='Revisión en curso…';
    try{
      const result=await api.previewCombined(args());if(!alive()||seq!==sequence)return;preview=result;
      $('#combine-preview').innerHTML=`<div class="import-summary valid"><strong>${result.total} integrantes en la nueva lista</strong><span>${result.total?`Numeración nueva: 1 a ${result.total}`:"Sin integrantes"}</span></div>${!result.total?'<p class="callout">No hay confirmandos con asistencia marcada en estas fechas. Marca la asistencia en las listas originales antes de combinarlas.</p>':''}${result.missingSurnames?`<p class="callout">${result.missingSurnames} ${result.missingSurnames===1?'registro no tiene apellidos separados y quedará al final, ordenado':'registros no tienen apellidos separados y quedarán al final, ordenados'} por nombre. Puedes completar sus apellidos en «Editar» y volver a ordenar la nueva lista.</p>`:''}${result.total>10000?'<p class="error-text">La lista supera el límite de 10,000 personas.</p>':''}${result.people.length?`<div class="table-wrap import-table"><table><thead><tr><th>Nuevo núm.</th><th>Apellidos</th><th>Nombre(s)</th><th>Padrino / madrina</th></tr></thead><tbody>${result.people.map(p=>`<tr><td>${p.id}</td><td>${e([p.paternalSurname,p.maternalSurname].filter(Boolean).join(' '))||'Sin apellidos separados'}</td><td>${e(p.givenNames)}</td><td>${e(p.sponsor)||'—'}</td></tr>`).join('')}</tbody></table></div><p class="help-text">Vista previa de los primeros ${result.people.length} integrantes. Después de crearla, usa «Ordenar y mover» para cambiar cualquier posición.</p>`:''}`;
      $('#combine-ready').textContent=`${result.total} integrantes con numeración nueva`;saveState();
    }catch(error){if(alive()&&seq===sequence){$('#combine-preview').textContent=error.message;$('#combine-ready').textContent='Revisa las listas seleccionadas';}}
  }
  $('#combine-first').onchange=$('#combine-second').onchange=()=>{review();};
  $('#combine-refresh').onclick=()=>{review();};
  $('#combine-date').oninput=$('#combine-title').oninput=saveState;
  form.onsubmit=async event=>{
    event.preventDefault();if(working||$('#combine-save').disabled||busy)return;
    working=true;saveState();$('#combine-save').textContent='Creando lista…';const input={...args(),date:$('#combine-date').value,title:$('#combine-title').value.trim(),revision:preview.revision};
    try{await mutation(()=>api.createCombined(input));await openList(input.date);modalDirty=false;dialog.close();toast('Lista creada por apellido, con números nuevos desde el 1.');}
    catch(error){if(alive())$('#combine-error').textContent=error.message;}
    finally{working=false;if(alive()){$('#combine-save').textContent='Crear lista con asistentes';saveState();}}
  };
  saveState();if(second)review();else $('#combine-preview').textContent='Necesitas tener al menos dos listas creadas para combinarlas.';
}

function organizeListModal(){
  const originalIds=list.people.map(p=>p.id),date=list.date;
  let people=[...list.people],selectedId=people[0]?.id,orderPage=1,orderQuery='',working=false;
  showModal(`<form id="order-form"><div class="modal-head"><div><div class="eyebrow">${e(shortDate(date))}</div><h2>Ordenar y mover integrantes</h2><p>El orden también se usará al guardar PDF o Excel / CSV.</p></div><button type="button" class="button ghost" data-close aria-label="Cerrar">✕</button></div><div class="modal-body"><div class="callout">Usa las flechas para subir o bajar una persona. Para llevarla a un lugar concreto, selecciónala e indica la posición. <strong>Su número de registro y sus asistencias se conservan.</strong></div><div class="order-toolbar"><label class="field"><span>Buscar integrante</span><input id="order-search" placeholder="Número, nombre o apellido…" autocomplete="off"></label><button type="button" class="button" id="order-alphabetical">A–Z por apellido</button></div><div class="order-destination"><div><span class="help-text">Integrante seleccionado</span><strong id="order-selected"></strong></div><label class="field">Mover a la posición<input id="order-position" type="number" min="1" max="${people.length}" required aria-label="Mover a la posición"></label><button type="button" class="button primary" id="order-move">Mover</button></div><p id="order-status" class="help-text" role="status"></p><div id="order-table"></div><p id="order-error" class="error-text" role="alert"></p></div><div class="modal-footer"><span class="help-text" id="order-changes">Orden actual de la lista</span><button type="button" class="button" data-close>Cancelar</button><button type="submit" class="button primary" id="order-save" disabled>Guardar orden</button></div></form>`);
  const dialog=$('#modal'),form=$('#order-form');dialog.classList.add('order-dialog');dialog.addEventListener('close',()=>dialog.classList.remove('order-dialog'),{once:true});
  function updateSelection(){const p=people.find(p=>p.id===selectedId);$('#order-selected').textContent=p?`#${p.id} · ${fullName(p)}`:'Lista vacía';$('#order-position').value=p?people.indexOf(p)+1:'';$('#order-position').disabled=!p;$('#order-move').disabled=!p||working;}
  function changed(){const dirty=people.some((p,index)=>p.id!==originalIds[index]);modalDirty=dirty;$('#order-save').disabled=!dirty||working;$('#order-changes').textContent=dirty?'Cambios de orden sin guardar':'Orden actual de la lista';}
  function drawOrder(){
    const q=normalize(orderQuery.trim()),matches=people.map((person,index)=>({person,index})).filter(({person})=>!q||(/^\d+$/.test(q)?person.id===Number(q):normalize(fullName(person)).includes(q))),pages=Math.max(1,Math.ceil(matches.length/8));orderPage=Math.min(orderPage,pages);
    const shown=matches.slice((orderPage-1)*8,orderPage*8);
    $('#order-table').innerHTML=`<div class="table-wrap order-table"><table><thead><tr><th>Lugar</th><th>Núm.</th><th>Integrante</th><th>Mover</th></tr></thead><tbody>${shown.map(({person:p,index})=>`<tr class="${p.id===selectedId?'selected-order':''}"><td>${index+1}</td><td>${p.id}</td><td><button type="button" class="cell-button" data-order-select="${p.id}" aria-label="Seleccionar a ${e(fullName(p))}">${e(fullName(p))}</button></td><td><div class="actions"><button type="button" class="button small" data-order-up="${p.id}" aria-label="Subir registro ${p.id}" ${index===0?'disabled':''}>↑</button><button type="button" class="button small" data-order-down="${p.id}" aria-label="Bajar registro ${p.id}" ${index===people.length-1?'disabled':''}>↓</button></div></td></tr>`).join('')}</tbody></table>${!shown.length?'<p class="help-text">No se encontraron integrantes.</p>':''}</div><div class="table-footer"><span>${matches.length} integrantes${q?' encontrados':''} · posiciones en la lista completa</span><div class="pagination"><button type="button" class="button small" id="order-prev" aria-label="Orden: página anterior" ${orderPage===1?'disabled':''}>←</button><span>${orderPage} / ${pages}</span><button type="button" class="button small" id="order-next" aria-label="Orden: página siguiente" ${orderPage===pages?'disabled':''}>→</button></div></div>`;
    form.querySelectorAll('[data-order-select]').forEach(button=>button.onclick=()=>{selectedId=Number(button.dataset.orderSelect);updateSelection();drawOrder();$('#order-position').focus();$('#order-position').select();});
    form.querySelectorAll('[data-order-up],[data-order-down]').forEach(button=>button.onclick=()=>{const id=Number(button.dataset.orderUp||button.dataset.orderDown),index=people.findIndex(p=>p.id===id);move(id,index+(button.dataset.orderUp?-1:1));});
    $('#order-prev').onclick=()=>{orderPage--;drawOrder();};$('#order-next').onclick=()=>{orderPage++;drawOrder();};
  }
  function move(id,target){
    if(working)return;$('#order-error').textContent='';
    if(!Number.isInteger(target)||target<0||target>=people.length){$('#order-error').textContent=`Escribe una posición entre 1 y ${people.length}.`;return;}
    const index=people.findIndex(p=>p.id===id);if(index<0)return;
    const [person]=people.splice(index,1);people.splice(target,0,person);selectedId=id;
    if(!orderQuery.trim())orderPage=Math.floor(target/8)+1;
    updateSelection();drawOrder();changed();$('#order-status').textContent=`${fullName(person)} está en la posición ${target+1}. Guarda el orden para conservar el cambio.`;
  }
  $('#order-search').oninput=event=>{orderQuery=event.target.value;orderPage=1;drawOrder();};
  $('#order-move').onclick=()=>move(selectedId,Number($('#order-position').value)-1);
  $('#order-position').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();$('#order-move').click();}};
  $('#order-alphabetical').onclick=()=>{if(working)return;people.sort(SagrarioOrder.comparePeople);orderPage=1;orderQuery='';$('#order-search').value='';updateSelection();drawOrder();changed();$('#order-status').textContent='Ordenados por apellido paterno, materno y nombre. Los registros sin apellidos separados quedan al final.';};
  form.onsubmit=async event=>{
    event.preventDefault();if(working||busy||$('#order-save').disabled)return;working=true;changed();$('#order-save').textContent='Guardando…';
    try{await mutation(async()=>{list=await api.reorderList({date,ids:people.map(p=>p.id)});await refreshMeta();});modalDirty=false;dialog.close();query='';filter='all';page=Math.max(1,Math.floor(list.people.findIndex(p=>p.id===selectedId)/pageSize)+1);render();toast('Orden guardado. Los números y las asistencias se conservaron.');}
    catch(error){if(form.isConnected&&dialog.open)$('#order-error').textContent=error.message;}
    finally{working=false;if(form.isConnected&&dialog.open){$('#order-save').textContent='Guardar orden';changed();}}
  };
  updateSelection();drawOrder();changed();
}
