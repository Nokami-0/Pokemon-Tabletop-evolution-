import {ClassicLevel} from "classic-level";
import {catalog} from "../data/catalog.mjs";
import {attackCatalog} from "../data/attacks.mjs";
import {catalogItemData, entrySource} from "../data/item-data.mjs";

const identity = (type,name,source) => JSON.stringify([type,name,source]);
const catalogByIdentity = new Map([...catalog,...attackCatalog]
  .map(entry => [identity(entry.kind,entry.name,entrySource(entry)),entry]));
const base = process.argv[2] || "packs";
for (const packName of ["gear","moves","features","classes"]) {
  const db = new ClassicLevel(`${base}/${packName}`,{valueEncoding:"json",createIfMissing:false});
  try {
    const changes = [];
    let unmatched = 0;
    for await (const [key,item] of db.iterator({gte:"!items!",lt:"!items~"})) {
      const entry = catalogByIdentity.get(identity(item.type,item.name,item.system.source));
      if (!entry) { unmatched++; continue; }
      const {system} = catalogItemData(entry);
      const refreshed = {...item.system,...system};
      if (JSON.stringify(refreshed) !== JSON.stringify(item.system)) {
        changes.push({type:"put",key,value:{...item,system:refreshed}});
      }
    }
    if (changes.length) await db.batch(changes);
    console.log(`${packName}: updated ${changes.length}; left ${unmatched} unmatched entries in place.`);
  } finally {
    await db.close();
  }
}
