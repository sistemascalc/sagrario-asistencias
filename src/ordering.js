(function(root){
  const collator=new Intl.Collator('es',{sensitivity:'base',numeric:true});
  const keys=p=>[p.paternalSurname||p.maternalSurname,p.paternalSurname?p.maternalSurname:'',p.givenNames];
  function comparePeople(a,b){
    const ak=keys(a),bk=keys(b);
    if(!ak[0]!==!bk[0])return ak[0]?-1:1;
    for(let i=0;i<ak.length;i++){const comparison=collator.compare(ak[i],bk[i]);if(comparison)return comparison;}
    return a.id-b.id;
  }
  const api={comparePeople};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SagrarioOrder=api;
})(globalThis);
