import {createHash} from "node:crypto";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {catalog} from "../data/catalog.mjs";
import {attackCatalog} from "../data/attacks.mjs";
import {catalogItemData, entrySource} from "../data/item-data.mjs";

const cliPath = process.argv[2];
if (!cliPath) throw new Error("Pass the absolute path to the Foundry CLI index.mjs.");
const {compilePack} = await import(pathToFileURL(cliPath));
const packs = {gear:"gear", move:"moves", feature:"features", class:"classes"};
const destination = fileURLToPath(new URL("../packs/",import.meta.url));
const staging = await mkdtemp(join(tmpdir(),"pte-packs-"));
try {
  await mkdir(destination,{recursive:true});
  for (const name of Object.values(packs)) await mkdir(join(staging,name));
  const ids = new Set();
  for (const entry of [...catalog,...attackCatalog]) {
    const id = createHash("sha256").update(JSON.stringify([entry.kind,entry.category,entry.name,entrySource(entry)])).digest("hex").slice(0,16);
    if (ids.has(id)) throw new Error(`Duplicate compendium entry: ${entry.name} (${entrySource(entry)})`);
    ids.add(id);
    const data = {_key:"!items!"+id,_id:id,...catalogItemData(entry)};
    await writeFile(join(staging,packs[entry.kind],id+".json"),JSON.stringify(data));
  }
  for (const name of Object.values(packs)) {
    const output = join(destination,name);
    await rm(output,{recursive:true,force:true});
    await compilePack(join(staging,name),output);
  }
} finally {
  await rm(staging,{recursive:true,force:true});
}
