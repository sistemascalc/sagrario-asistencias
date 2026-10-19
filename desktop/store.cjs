const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {combineAttendees}=require('./combine.cjs');

function dateOK(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2199-12-31') return false;
  const date=new Date(value+'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value;
}
function str(value, max = 300) { if (typeof value !== 'string' || value.length > max) throw Error('Texto inválido o demasiado largo.'); return value.trim(); }
function person(p) {
  if (!Number.isSafeInteger(p.id) || p.id < 1 || p.id > 999999) throw Error('El número debe ser un entero entre 1 y 999999.');
  const clean = { id:p.id, givenNames:str(p.givenNames), paternalSurname:str(p.paternalSurname), maternalSurname:str(p.maternalSurname), sponsor:str(p.sponsor), notes:str(p.notes || '',4000) };
  if (!clean.givenNames) throw Error('Escribe el nombre del confirmando.');
  return clean;
}
function validateList(list) {
  if (!list || !dateOK(list.date) || !Array.isArray(list.people) || list.people.length > 10000) throw Error('La lista no es válida.');
  const clean = {date:list.date,title:str(list.title),source:str(list.source || '',500),people:list.people.map(person),attendance:{}};
  if (new Set(clean.people.map(p=>p.id)).size !== clean.people.length) throw Error('Hay números repetidos.');
  for (const p of clean.people) {
    const a = list.attendance?.[p.id] || {};
    if (a.confirmand !== undefined && typeof a.confirmand !== 'boolean' || a.sponsor !== undefined && typeof a.sponsor !== 'boolean') throw Error('Asistencia inválida.');
    clean.attendance[p.id] = {confirmand:!!a.confirmand,sponsor:!!a.sponsor,notes:str(a.notes || '',4000)};
  }
  return clean;
}
function atomicWrite(file, value) {
  const tmp = file + '.' + randomUUID() + '.tmp';
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const fd = fs.openSync(tmp,'wx');
  try { fs.writeFileSync(fd,JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (fs.existsSync(file)) fs.copyFileSync(file,file+'.bak');
  fs.renameSync(tmp,file);
}
function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch (error) {
    if (fs.existsSync(file+'.bak')) { const value=JSON.parse(fs.readFileSync(file+'.bak','utf8')); fs.copyFileSync(file+'.bak',file); return value; }
    throw error;
  }
}
function summary(l) {
  const entries=Object.values(l.attendance);
  return {date:l.date,title:l.title,total:l.people.length,confirmands:entries.filter(a=>a.confirmand).length,sponsors:entries.filter(a=>a.sponsor).length};
}
class Store {
  constructor(root, seed) {
    this.root=root; this.dir=path.join(root,'lists'); this.summaries=new Map();
    fs.mkdirSync(this.dir,{recursive:true});
    for (const name of fs.readdirSync(this.dir).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n))) {
      const l=validateList(readJSON(path.join(this.dir,name))); this.summaries.set(l.date,summary(l));
    }
    if (!this.summaries.size) this.save(validateList(seed));
  }
  get(date) { if (!dateOK(date) || !this.summaries.has(date)) throw Error('Selecciona una lista existente.'); return validateList(readJSON(path.join(this.dir,date+'.json'))); }
  save(list) { const clean=validateList(list); atomicWrite(path.join(this.dir,clean.date+'.json'),clean); this.summaries.set(clean.date,summary(clean)); return clean; }
  list() { return [...this.summaries.values()].sort((a,b)=>b.date.localeCompare(a.date)); }
  attendance({date,id,role,value}) {
    const list=this.get(date);
    if (!list.people.some(p=>p.id===id) || !['confirmand','sponsor'].includes(role) || typeof value!=='boolean') throw Error('Asistencia inválida.');
    list.attendance[id][role]=value; return this.save(list);
  }
  edit({date,record,dailyNotes,create=false,present}) {
    const list=this.get(date), p=person(record), index=list.people.findIndex(x=>x.id===p.id);
    if (create && index>=0) throw Error('Ese número ya existe en esta lista.');
    if (!create && index<0) throw Error('No se encontró el registro.');
    if (create) {list.people.push(p); list.attendance[p.id]={confirmand:false,sponsor:false,notes:''};}
    else list.people[index]=p;
    list.attendance[p.id].notes=str(dailyNotes || '',4000);
    if(present) {
      if(typeof present.confirmand!=='boolean'||typeof present.sponsor!=='boolean')throw Error('Asistencia inválida.');
      list.attendance[p.id].confirmand=present.confirmand;list.attendance[p.id].sponsor=present.sponsor;
    }
    return this.save(list);
  }
  create({date,sourceDate,title}) {
    if (!dateOK(date)) throw Error('Selecciona una fecha válida entre 1900 y 2199.');
    if (this.summaries.has(date)) throw Error('Ya existe una lista para ese día. Abre la lista para conservar su asistencia.');
    const source=this.get(sourceDate);
    return this.save({date,title:str(title || source.title),source:source.source,people:source.people,attendance:{}});
  }
  combined({sourceDates,resolutions={}}) {
    if(!Array.isArray(sourceDates)||sourceDates.length!==2||sourceDates[0]===sourceDates[1])throw Error('Selecciona dos listas de fechas diferentes.');
    return combineAttendees(sourceDates.map(date=>this.get(date)),resolutions);
  }
  previewCombined(args) {const result=this.combined(args);return {...result,people:result.people.slice(0,12)};}
  createCombined({date,title,sourceDates,resolutions,revision}) {
    if(!dateOK(date))throw Error('Selecciona una fecha válida entre 1900 y 2199.');
    if(this.summaries.has(date))throw Error('Ya existe una lista para ese día. Elige otra fecha para conservar sus datos.');
    if(!str(title))throw Error('Escribe el nombre de la nueva lista.');
    const result=this.combined({sourceDates,resolutions});
    if(revision!==result.revision)throw Error('Las listas de origen cambiaron. Revisa nuevamente la vista previa.');
    if(result.unresolved)throw Error('Resuelve los números que corresponden a nombres diferentes.');
    if(!result.total)throw Error('No hay confirmandos con asistencia marcada en las listas seleccionadas.');
    if(result.total>10000)throw Error('La nueva lista supera el límite de 10,000 personas.');
    return this.save({date,title,source:`Asistentes de ${sourceDates.join(' y ')}. Confirmando presente en al menos una fecha.`,people:result.people,attendance:{}});
  }
  reorder({date,ids}) {
    const list=this.get(date),byId=new Map(list.people.map(p=>[p.id,p]));
    if(!Array.isArray(ids)||ids.length!==list.people.length||new Set(ids).size!==ids.length||ids.some(id=>!Number.isSafeInteger(id)||!byId.has(id)))throw Error('La lista cambió o el orden no es válido. Cierra esta ventana y vuelve a organizarla.');
    list.people=ids.map(id=>byId.get(id));return this.save(list);
  }
  importList({date,title,source,people}) {
    if(!dateOK(date))throw Error('Selecciona una fecha válida entre 1900 y 2199.');
    if(this.summaries.has(date))throw Error('Ya existe una lista para ese día. Elige otra fecha para importar y conservar sus datos.');
    if(!str(title))throw Error('Escribe el nombre de la lista.');
    if(!Array.isArray(people)||!people.length)throw Error('El archivo no contiene personas para importar.');
    const clean=validateList({date,title,source,people,attendance:{}});
    clean.people.sort((a,b)=>a.id-b.id);
    return this.save(clean);
  }
  year({year,sourceDate,title}) {
    if (!Number.isInteger(year) || year<1900 || year>2199) throw Error('El año debe estar entre 1900 y 2199.');
    this.get(sourceDate);
    let created=0, skipped=0;
    for(let day=new Date(Date.UTC(year,0,1));day.getUTCFullYear()===year;day.setUTCDate(day.getUTCDate()+1)) {
      const date=day.toISOString().slice(0,10);
      if(this.summaries.has(date)) skipped++; else {this.create({date,sourceDate,title}); created++;}
    }
    return {created,skipped};
  }
  backup() { return {app:'sagrario-asistencias',schemaVersion:1,exportedAt:new Date().toISOString(),lists:this.list().map(l=>this.get(l.date))}; }
  restore(input) {
    if (input?.app!=='sagrario-asistencias' || input.schemaVersion!==1 || !Array.isArray(input.lists) || !input.lists.length || input.lists.length>5000) throw Error('Este archivo no es un respaldo válido de Sagrario.');
    const lists=input.lists.map(validateList);
    if(new Set(lists.map(l=>l.date)).size!==lists.length) throw Error('Fechas repetidas en el respaldo.');
    const stage=path.join(this.root,'restore-'+randomUUID()), old=path.join(this.root,'before-restore-'+Date.now());
    fs.mkdirSync(stage);
    const merged=new Map(this.list().map(l=>[l.date,this.get(l.date)]));
    for(const l of lists) merged.set(l.date,l);
    for(const l of merged.values()) atomicWrite(path.join(stage,l.date+'.json'),l);
    fs.renameSync(this.dir,old);
    try {fs.renameSync(stage,this.dir);} catch(error) {fs.renameSync(old,this.dir);throw error;}
    this.summaries=new Map([...merged.values()].map(l=>[l.date,summary(l)]));
    return {restored:lists.length};
  }
}
module.exports={Store,dateOK,validateList,atomicWrite,summary};
