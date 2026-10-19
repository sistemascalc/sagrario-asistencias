async function seatingModal(){
  const date=list.date;let plan=await api.previewSeating({date}),draft=structuredClone(plan.seating.assignments),selectedBench=Object.values(draft)[0]?.bench||1,working=false;
  showModal(`<form id="seating-form"><div class="modal-head"><div><div class="eyebrow">${e(shortDate(date))} · Catedral</div><h2>Bancas y padrinos</h2><p>Tres confirmandos con sus padrinos por banca: seis personas.</p></div><button type="button" class="button ghost" data-close aria-label="Cerrar">✕</button></div><div class="modal-body"><div class="callout" id="seating-status"></div><div class="actions seating-actions"><button type="button" class="button" id="seating-auto">Asignar según el orden de la lista</button><button type="button" class="button" id="seating-pdf">↓ Lista y croquis PDF</button><button type="button" class="button" id="seating-csv">↓ Lista por banca CSV</button></div><p class="help-text">Selecciona una banca en el croquis para ver sus integrantes. El orden de la lista se respeta al asignar; mover filas después no cambia las bancas guardadas.</p><div class="seating-layout"><div class="seating-map-wrap"><div class="seating-map" id="seating-map" aria-label="Croquis de bancas de la catedral"></div></div><div class="seating-details"><div id="seating-bench"></div><div class="seat-move"><h3>Mover una pareja</h3><label class="field">Confirmando<select id="seat-person">${plan.people.map(p=>`<option value="${p.id}">#${p.id} · ${e(fullName(p))}</option>`).join('')}</select></label><div class="form-grid"><label class="field">Banca<select id="seat-bench">${plan.layout.benches.map(b=>`<option value="${b.number}">${b.number} · zona ${b.zone}</option>`).join('')}</select></label><label class="field">Lugar de pareja<select id="seat-pair"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label></div><p class="help-text">Si el lugar está ocupado, las dos parejas intercambian sus lugares. Confirmando y padrino siempre se mueven juntos.</p><button type="button" class="button" id="seat-move">Mover pareja</button><p class="help-text" id="seat-move-status" role="status"></p></div></div></div><p id="seating-error" class="error-text" role="alert"></p></div><div class="modal-footer"><span class="help-text" id="seating-changes"></span><button type="button" class="button" data-close>Cancelar</button><button type="submit" class="button primary" id="seating-save">Guardar bancas</button></div></form>`);
  const dialog=$('#modal'),form=$('#seating-form');dialog.classList.add('seating-dialog');dialog.addEventListener('close',()=>dialog.classList.remove('seating-dialog'),{once:true});
  const changed=()=>!plan.saved||JSON.stringify(draft)!==JSON.stringify(plan.seating.assignments);
  const name=id=>fullName(plan.people.find(p=>p.id===Number(id)));
  function draw(){
    const used=new Set(Object.values(draft).map(s=>s.bench)),assigned=Object.keys(draft).length,dirty=changed();modalDirty=dirty;
    $('#seating-status').textContent=`${assigned} de ${plan.people.length} confirmandos con banca · ${used.size} bancas utilizadas · ${assigned*2} lugares reservados con sus padrinos. ${dirty?'Vista previa: guarda para aplicar la distribución.':'Distribución guardada.'}`;
    $('#seating-changes').textContent=dirty?'Cambios de bancas sin guardar':'Las bancas están guardadas';$('#seating-save').disabled=working||!dirty;
    $('#seating-pdf').disabled=$('#seating-csv').disabled=working||dirty;$('#seat-move').disabled=working||!plan.people.length;$('#seating-auto').disabled=working;
    $('#seating-map').innerHTML=plan.layout.benches.map(b=>`<button type="button" class="bench-button ${used.has(b.number)?'occupied':''} ${b.number===selectedBench?'selected':''}" data-bench="${b.number}" data-row="${b.row-4}" data-column="${b.column-1}" aria-label="Banca ${b.number}, zona ${b.zone}, ${Object.values(draft).filter(s=>s.bench===b.number).length} de 3 parejas" aria-pressed="${b.number===selectedBench}">${b.number}</button>`).join('')+plan.layout.zones.map(z=>`<span class="bench-zone" data-row="${z.row-4}" data-column="${z.column-1}">Z${z.number}</span>`).join('')+plan.layout.pillars.map(p=>`<span class="bench-pillar" data-row="${p.row-4}" data-column="${p.column-1}" data-height="${p.height}">Pilastra</span>`).join('');
    form.querySelectorAll('[data-row]').forEach(el=>{el.style.gridColumn=el.dataset.column;el.style.gridRow=el.dataset.row+(el.dataset.height?'/span '+el.dataset.height:'');});
    form.querySelectorAll('[data-bench]').forEach(button=>button.onclick=()=>{selectedBench=Number(button.dataset.bench);$('#seat-bench').value=String(selectedBench);draw();});
    const bench=plan.layout.benches.find(b=>b.number===selectedBench);
    $('#seating-bench').innerHTML=`<h3>Banca ${selectedBench} <span class="badge">Zona ${bench.zone}</span></h3>`+[1,2,3].map(pair=>{const id=Object.keys(draft).find(id=>draft[id].bench===selectedBench&&draft[id].pair===pair),p=plan.people.find(p=>p.id===Number(id));return `<div class="bench-person"><span class="help-text">Pareja ${pair} · 2 lugares</span>${p?`<strong>#${p.id} · ${e(fullName(p))}</strong><span>Padrino: ${e(p.sponsor)||'Nombre pendiente'}</span>`:'<strong class="text-muted">Disponible</strong>'}</div>`;}).join('');
  }
  function selectPerson(){const seat=draft[$('#seat-person').value];if(seat){selectedBench=seat.bench;$('#seat-bench').value=String(seat.bench);$('#seat-pair').value=String(seat.pair);draw();}}
  $('#seat-person').onchange=selectPerson;
  $('#seat-move').onclick=()=>{
    if(working)return;$('#seating-error').textContent='';
    const id=$('#seat-person').value,bench=Number($('#seat-bench').value),pair=Number($('#seat-pair').value),old=draft[id],other=Object.keys(draft).find(key=>key!==id&&draft[key].bench===bench&&draft[key].pair===pair);
    if(other&&!old){$('#seating-error').textContent='Ese lugar está ocupado. Elige un lugar libre para esta pareja sin banca.';return;}
    if(other)draft[other]={...old};draft[id]={bench,pair};selectedBench=bench;draw();$('#seat-move-status').textContent=other?`${name(id)} y ${name(other)} intercambiaron sus lugares. Guarda las bancas para aplicar el cambio.`:`${name(id)} queda en la banca ${bench}, pareja ${pair}. Guarda las bancas para aplicar el cambio.`;
  };
  $('#seating-auto').onclick=()=>safe(async()=>{
    if(working)return;working=true;draw();
    try{plan=await api.previewSeating({date,reassign:true});draft=structuredClone(plan.seating.assignments);selectedBench=Object.values(draft)[0]?.bench||1;$('#seat-move-status').textContent='';}
    finally{working=false;if(form.isConnected){selectPerson();draw();}}
  });
  for(const format of ['pdf','csv'])$('#seating-'+format).onclick=()=>safe(async()=>{const result=await api.exportSeating({date,format});if(!result.canceled)toast('Lista por banca guardada: '+result.path);});
  form.onsubmit=async event=>{
    event.preventDefault();if(working||busy||!changed())return;working=true;draw();$('#seating-error').textContent='';
    try{await mutation(async()=>{list=await api.saveSeating({date,revision:plan.revision,assignments:draft});await refreshMeta();});modalDirty=false;dialog.close();render();toast('Bancas guardadas. Al buscar a cada confirmando verás su banca.');}
    catch(error){if(form.isConnected)$('#seating-error').textContent=error.message;}
    finally{working=false;if(form.isConnected&&dialog.open)draw();}
  };
  selectPerson();draw();
}
