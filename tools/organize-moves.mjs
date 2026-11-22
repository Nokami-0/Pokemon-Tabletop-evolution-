import {ClassicLevel} from "classic-level";

const folders = {
  moves: {_id:"ptePokemonMoves1", name:"Pokémon Moves"},
  weapon: {_id:"pteWeaponAttack1", name:"Weapon Attacks"}
};
const db = new ClassicLevel(process.argv[2] || "packs/moves", {valueEncoding:"json"});
try {
  const operations = [];
  const counts = {moves:0,weapon:0};
  for await (const [key, item] of db.iterator({gte:"!items!", lt:"!items~"})) {
    const source = item.system?.source ?? "";
    const group = /, Weapon Attacks row \d+$/.test(source) ? "weapon" : "moves";
    counts[group]++;
    operations.push({type:"put",key,value:{...item,folder:folders[group]._id}});
  }
  if (!counts.moves || !counts.weapon) throw new Error("Expected Pokémon moves and weapon attacks in the source pack.");
  for (const folder of Object.values(folders)) {
    operations.push({type:"put",key:"!folders!" + folder._id,
      value:{...folder,folder:null,type:"Item",color:null,sorting:"a",sort:0,flags:{}}});
  }
  await db.batch(operations);
  await db.compactRange("", "~");
  console.log("Pokémon moves:",counts.moves,"Weapon attacks:",counts.weapon);
} finally {
  await db.close();
}
