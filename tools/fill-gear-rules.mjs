import {ClassicLevel} from "classic-level";
import {catalog} from "../data/catalog.mjs";
import {catalogEffect, entrySource} from "../data/item-data.mjs";

const listings = new Map(catalog.filter(entry=>entry.kind === "gear")
  .map(entry=>[JSON.stringify([entry.name,entrySource(entry)]),entry]));
const db = new ClassicLevel(process.argv[2] || "packs/gear",{valueEncoding:"json"});
try {
  const changes = [];
  let count = 0;
  for await (const [key,item] of db.iterator({gte:"!items!",lt:"!items~"})) {
    const entry = listings.get(JSON.stringify([item.name,item.system.source]));
    const description = entry ? catalogEffect(entry) : item.system.description;
    if (!description || /See the cited page|^See the linked reference|^Check the linked rule page/.test(description)) {
      throw new Error(`Missing gear rules for ${item.name}`);
    }
    if (description !== item.system.description) {
      changes.push({type:"put",key,value:{...item,system:{...item.system,description}}});
    }
    count++;
  }
  if (!count) throw new Error("Gear pack is empty.");
  await db.batch(changes);
  await db.compactRange("", "~");
  console.log(`Verified ${count} gear descriptions. Updated ${changes.length}.`);
} finally {
  await db.close();
}
