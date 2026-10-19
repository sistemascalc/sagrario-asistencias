const {createHash}=require('node:crypto');
const {comparePeople}=require('../src/ordering.js');
const fullName=p=>[p.givenNames,p.paternalSurname,p.maternalSurname].filter(Boolean).join(' ');
const identity=p=>fullName(p).normalize('NFC').toLocaleLowerCase('es').replace(/\s+/g,' ').trim();

function combineAttendees(lists,resolutions={}){
  if(!resolutions||typeof resolutions!=='object'||Array.isArray(resolutions))throw Error('Revisa las coincidencias de las listas.');
  const groups=new Map(),people=[],conflicts=[],renumbered=[];
  let duplicateCount=0;
  lists.forEach((list,sourceIndex)=>{
    for(const person of list.people){
      if(!list.attendance[person.id].confirmand)continue;
      if(!groups.has(person.id))groups.set(person.id,[]);
      groups.get(person.id).push({person,sourceIndex,date:list.date});
    }
  });
  const usedIds=new Set(groups.keys());let nextId=Math.max(0,...usedIds)+1;
  function unusedId(){if(nextId>999999)nextId=1;while(usedIds.has(nextId))nextId++;if(nextId>999999)throw Error('No quedan números de registro disponibles.');usedIds.add(nextId);return nextId++;}
  const conflictKeys=new Set();
  for(const [id,entries] of groups){
    if(entries.length===1){people.push({...entries[0].person});continue;}
    const [first,second]=entries;
    if(identity(first.person)===identity(second.person)){
      people.push({...entries.toSorted((a,b)=>b.date.localeCompare(a.date))[0].person});duplicateCount++;continue;
    }
    conflictKeys.add(String(id));
    const choice=resolutions[id]||'';
    if(choice&&!['first','second','both'].includes(choice))throw Error('La resolución de coincidencias no es válida.');
    conflicts.push({id,first:{name:fullName(first.person),date:first.date},second:{name:fullName(second.person),date:second.date},choice});
    if(choice==='first')people.push({...first.person});
    if(choice==='second')people.push({...second.person});
    if(choice==='both'){
      const assignedId=unusedId();people.push({...first.person},{...second.person,id:assignedId});
      renumbered.push({id:assignedId,originalId:id,name:fullName(second.person),date:second.date});
    }
  }
  if(Object.keys(resolutions).some(key=>!conflictKeys.has(key)))throw Error('Las listas cambiaron. Vuelve a revisar la vista previa.');
  people.sort(comparePeople);
  const byName=new Map();
  for(const person of people){const name=identity(person);if(!byName.has(name))byName.set(name,[]);byName.get(name).push(person);}
  return {
    people,total:people.length,conflicts,unresolved:conflicts.filter(c=>!c.choice).length,duplicateCount,renumbered,
    missingSurnames:people.filter(p=>!p.paternalSurname&&!p.maternalSurname).length,
    repeatedNames:[...byName.values()].filter(group=>group.length>1).map(group=>({name:fullName(group[0]),ids:group.map(p=>p.id)})),
    revision:createHash('sha256').update(JSON.stringify(lists)).digest('hex')
  };
}
module.exports={combineAttendees};
