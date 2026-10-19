const {createHash}=require('node:crypto');
const {comparePeople}=require('../src/ordering.js');

function combineAttendees(lists){
  // Numbers belong to their source list; matching numbers or names are not identities.
  const attendees=lists.flatMap(list=>list.people.filter(person=>list.attendance[person.id].confirmand));
  const people=attendees.sort(comparePeople).map((person,index)=>({...person,id:index+1}));
  return {
    people,total:people.length,
    missingSurnames:people.filter(p=>!p.paternalSurname&&!p.maternalSurname).length,
    revision:createHash('sha256').update(JSON.stringify(lists)).digest('hex')
  };
}
module.exports={combineAttendees};
