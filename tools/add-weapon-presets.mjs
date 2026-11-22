import {createHash} from "node:crypto";
import {ClassicLevel} from "classic-level";
import {weaponPresets} from "../data/weapon-presets.mjs";
const idFor = value => createHash("sha256").update("pte-weapon-presets:" + value).digest("hex").slice(0,16);
const root = idFor("folder");
const folders = [["Ready-to-Use Weapons",root,"pteGearWeapons01"],
  ...["Training","Simple","Fine","Legendary"].map(name=>[name,idFor(name),root])];
const db = new ClassicLevel(process.argv[2] || "packs/gear",{valueEncoding:"json"});
try {
  if ((await db.get("!folders!pteGearWeapons01"))?.name !== "Weapons") throw Error("Missing Weapons folder.");
  await db.batch([
    ...folders.map(([name,_id,folder],index)=>({type:"put",key:"!folders!" + _id,
      value:{_id,name,folder,type:"Item",color:null,sorting:"m",sort:index*100000,flags:{}}})),
    ...Array.from(weaponPresets.values(),({key,qualityName,gear})=>{
      const _id = idFor(key);
      return {type:"put",key:"!items!" + _id,value:{...gear,_id,folder:idFor(qualityName),effects:[]}};
    })
  ]);
  await db.compactRange("", "~");
  console.log(`Packaged ${weaponPresets.size} weapon builds.`);
} finally {
  await db.close();
}
