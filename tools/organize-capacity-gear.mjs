import {ClassicLevel} from "classic-level";

const names = new Set(["Light Backpack","Heavy Backpack","Cargo Bag"]);
const folder = {_id:"pteGearCarry0001",name:"Backpacks & Slot Expanders",folder:"pteGearEquipmt01",
  type:"Item",color:null,sorting:"a",sort:0,flags:{}};
const db = new ClassicLevel(process.argv[2] || "packs/gear",{valueEncoding:"json"});
try {
  const parent = await db.get("!folders!" + folder.folder);
  if (parent?.name !== "Equipment & Supplies") throw new Error("Expected the Equipment & Supplies folder.");
  const changes = [];
  for await (const [key,item] of db.iterator({gte:"!items!",lt:"!items~"})) {
    if (names.delete(item.name)) changes.push({type:"put",key,value:{...item,folder:folder._id}});
  }
  if (names.size) throw new Error(`Missing capacity gear: ${[...names].join(", ")}`);
  await db.batch([{type:"put",key:"!folders!" + folder._id,value:folder},...changes]);
  await db.compactRange("", "~");
  console.log(`Grouped ${changes.length} capacity items.`);
} finally {
  await db.close();
}
