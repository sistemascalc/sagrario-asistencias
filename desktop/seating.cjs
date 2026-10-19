const {createHash}=require('node:crypto');
const layout=require('../data/cathedral-layout.json');
const benches=new Map(layout.benches.map(b=>[b.number,b]));
const zones=new Map(layout.zones.map(z=>[z.number,z]));
const revision=list=>createHash('sha256').update(JSON.stringify(list)).digest('hex');

function validateZoneLeaders(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Revisa los encargados de cada zona.');
  const result={};
  for(const [zone,names] of Object.entries(value)){
    if(!zones.has(Number(zone))||String(Number(zone))!==zone||!Array.isArray(names)||names.length>3)throw Error('Cada zona permite hasta tres encargados.');
    result[zone]=Array.from({length:3},(_,i)=>{
      const name=i<names.length?names[i]:'';
      if(typeof name!=='string'||name.length>120)throw Error('El nombre de cada encargado debe tener hasta 120 caracteres.');
      return name.trim();
    });
  }
  return result;
}

function validateSeating(value,people){
  if(!value||value.layoutId!==layout.id||!value.assignments||typeof value.assignments!=='object'||Array.isArray(value.assignments))throw Error('La distribución de bancas no es válida.');
  const ids=new Set(people.map(p=>String(p.id))),occupied=new Set(),assignments={};
  for(const [id,seat] of Object.entries(value.assignments)){
    if(!ids.has(id)||!seat||!Number.isInteger(seat.bench)||!benches.has(seat.bench)||!Number.isInteger(seat.pair)||seat.pair<1||seat.pair>layout.pairsPerBench)throw Error('Revisa el registro, la banca y el lugar de pareja.');
    const key=seat.bench+':'+seat.pair;if(occupied.has(key))throw Error('Dos parejas no pueden ocupar el mismo lugar de una banca.');
    occupied.add(key);assignments[id]={bench:seat.bench,pair:seat.pair};
  }
  return {layoutId:layout.id,assignments,...(value.zoneLeaders!==undefined?{zoneLeaders:validateZoneLeaders(value.zoneLeaders)}:{})};
}
function automaticSeating(people){
  if(people.length>layout.benches.length*layout.pairsPerBench)throw Error('El croquis permite hasta 480 confirmandos con sus padrinos. No hay bancas suficientes.');
  return {layoutId:layout.id,assignments:Object.fromEntries(people.map((p,index)=>[p.id,{bench:layout.benches[Math.floor(index/layout.pairsPerBench)].number,pair:index%layout.pairsPerBench+1}]))};
}
function seatingRows(list){
  return list.people.map(p=>({person:p,seat:list.seating?.assignments[p.id]})).sort((a,b)=>(a.seat?.bench??Infinity)-(b.seat?.bench??Infinity)||(a.seat?.pair??Infinity)-(b.seat?.pair??Infinity));
}
module.exports={layout,benches,zones,revision,validateSeating,validateZoneLeaders,automaticSeating,seatingRows};
