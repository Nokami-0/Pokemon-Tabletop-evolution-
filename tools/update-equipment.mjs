import {ClassicLevel} from "classic-level";
import {equipment, equipmentDescription} from "../data/equipment.mjs";

const folders = [
  {_id:"pteGearArmor0001",name:"Armor",folder:"pteGearEquipmt01"},
  {_id:"pteGearLight0001",name:"Light Armor",folder:"pteGearArmor0001"},
  {_id:"pteGearHeavy0001",name:"Heavy Armor",folder:"pteGearArmor0001"},
  {_id:"pteGearShield001",name:"Shields",folder:"pteGearEquipmt01"}
];
const folderIds = new Map(folders.map(({name,_id})=>[name,_id]));
const db = new ClassicLevel(process.argv[2] || "packs/gear",{valueEncoding:"json"});
try {
  const operations = [];
  for await (const [key,item] of db.iterator({gte:"!items!",lt:"!items~"})) {
    if (!Object.hasOwn(equipment,item.name)) continue;
    const folder = folderIds.get(equipment[item.name].group) ?? item.folder;
    operations.push({type:"put",key,value:{...item,folder,
      system:{...item.system,description:equipmentDescription(item.name)}}});
  }
  if (operations.length !== Object.keys(equipment).length) throw new Error("Gear pack is missing an equipment entry.");
  for (const folder of folders) {
    operations.push({type:"put",key:"!folders!" + folder._id,
      value:{...folder,type:"Item",color:null,sorting:"a",sort:0,flags:{}}});
  }
  await db.batch(operations);
  await db.compactRange("", "~");
  console.log("Added armor and shield folders and equipment descriptions.");
} finally {
  await db.close();
}
