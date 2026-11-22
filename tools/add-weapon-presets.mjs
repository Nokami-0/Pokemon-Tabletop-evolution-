import {createHash} from "node:crypto";
import {ClassicLevel} from "classic-level";
import {weaponPresets} from "../data/weapon-presets.mjs";
const idFor = value => createHash("sha256").update("pte-weapon-presets:" + value).digest("hex").slice(0,16);
const root = "pteGearWeapons01";
const folders = new Map();
function addFolder(name,parent) {
  const id = idFor(`${parent}/${name}`);
  folders.set(id,[name,id,parent]);
  return id;
}
const placements = new Map();
for (const {key,qualityName,gear} of weaponPresets.values()) {
  const {type,range} = gear.flags["pokemon-tabletop-evolution"].weaponBuild;
  const typeFolder = addFolder(type,root);
  placements.set(key,addFolder(`${range} · ${qualityName}`,typeFolder));
}
const db = new ClassicLevel(process.argv[2] || "packs/gear",{valueEncoding:"json"});
try {
  if ((await db.get("!folders!" + root))?.name !== "Weapons") throw Error("Missing Weapons folder.");
  await db.batch([
    ...["folder","Training","Simple","Fine","Legendary"].map(name=>({type:"del",key:"!folders!" + idFor(name)})),
    ...Array.from(folders.values()).map(([name,_id,folder],index)=>({type:"put",key:"!folders!" + _id,
      value:{_id,name,folder,type:"Item",color:null,sorting:"m",sort:index*100000,flags:{}}})),
    ...Array.from(weaponPresets.values(),({key,gear})=>{
      const _id = idFor(key);
      return {type:"put",key:"!items!" + _id,value:{...gear,_id,folder:placements.get(key),effects:[]}};
    })
  ]);
  await db.compactRange("", "~");
  console.log(`Packaged ${weaponPresets.size} weapon builds.`);
} finally {
  await db.close();
}
