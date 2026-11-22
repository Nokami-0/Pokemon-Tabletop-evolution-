import {readFile, writeFile} from "node:fs/promises";
import {gunzipSync, gzipSync} from "node:zlib";

const [mode, path = "dex-profiles.edit.json"] = process.argv.slice(2);
const compressed = new URL("../data/dex-profiles.json.gz", import.meta.url);
if (mode === "unpack") {
  const profiles = JSON.parse(gunzipSync(await readFile(compressed)));
  await writeFile(path, JSON.stringify(profiles, null, 2) + "\n", {flag:"wx"});
} else if (mode === "pack") {
  const profiles = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(profiles) || !profiles.length ||
    profiles.some(profile => !Number.isInteger(profile?.page) || !profile.name) ||
    new Set(profiles.map(profile => profile.page)).size !== profiles.length) {
    throw Error("Expected profiles with unique page numbers and species names.");
  }
  await writeFile(compressed, gzipSync(JSON.stringify(profiles), {level:9}));
} else {
  throw Error("Use unpack or pack, followed by the path to the editable JSON file.");
}
