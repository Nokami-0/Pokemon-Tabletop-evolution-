import {ClassicLevel} from "classic-level";

const weaponQualities = new Set(["Training Weapon", "Simple Weapon", "Fine Weapon", "Legendary Weapon"]);
const captureItems = new Set(["Pokeball", "Party Pokéballs", "Companion Ball"]);
const consumables = new Set([
  "Basic Pokefood", "Typed Pokefood", "Pokepuff", "Shard",
  "Trap Set", "Small Gadget", "Focus Sash", "Ability Capsule",
  "Elemental Catalyst", "Evolution Stone", "Harnessed Attack", "Rare Candy",
  "Tutor Record", "Elemental Enchantment"
]);

const root = {
  weapons: ["pteGearWeapons01", "Weapons"],
  consumables: ["pteGearConsume01", "Consumables"],
  equipment: ["pteGearEquipmt01", "Equipment & Supplies"]
};
const children = {
  examples: ["pteGearExample01", "Weapon Examples", root.weapons[0]],
  qualities: ["pteGearQuality01", "Weapon Qualities", root.weapons[0]],
  capture: ["pteGearCapture01", "Poké Balls & Capture", root.consumables[0]],
  potions: ["pteGearPotions01", "Potions & Poultices", root.consumables[0]],
  other: ["pteGearOtherCs01", "Other Consumables", root.consumables[0]]
};

function folderFor(name) {
  if (weaponQualities.has(name)) return children.qualities[0];
  if (captureItems.has(name)) return children.capture[0];
  if (/\b(Potion|Poultice)\b/.test(name)) return children.potions[0];
  if (consumables.has(name)) return children.other[0];
  return root.equipment[0];
}

const weaponExamples = [
  ["pteGearSword0001", "Sword (Weapon Example)", "Use Create Weapon and choose Martial, Melee. Combat is the default qualifying skill. Choose its size, quality, keywords, and eligible attacks to build the sword.", "PTE Rule Book, pp. 220–221"],
  ["pteGearMace00001", "Mace (Weapon Example)", "Use Create Weapon and choose Martial, Melee. Combat is the default qualifying skill. Choose its size and quality. Blunt is an option when the weapon has room for a keyword.", "PTE Rule Book, pp. 220–221"],
  ["pteGearImpWep001", "Improvised Weapon (Rules Reference)", "For a one-off attack with an object at hand, the GM determines which attack or damage rules represent the object and how to resolve the attempt. A carried weapon built from an improvised object can use Create Weapon with the GM’s approval.", "PTE Rule Book, p. 166"]
];

const db = new ClassicLevel(process.argv[2] || "packs/gear", {valueEncoding:"json"});
try {
  const operations = [];
  const counts = new Map();
  for await (const [key, item] of db.iterator({gte:"!items!", lt:"!items~"})) {
    if (weaponExamples.some(([id]) => id === item._id)) continue;
    const folder = folderFor(item.name);
    counts.set(folder, (counts.get(folder) || 0) + 1);
    operations.push({type:"put", key, value:{...item, folder}});
  }
  if (!operations.length) throw new Error("No gear entries found in the pack.");
  for (const [index, [_id, name, folder = null]] of Object.values({...root, ...children}).entries()) {
    operations.push({type:"put", key:"!folders!" + _id,
      value:{_id, name, folder, type:"Item", color:null, sorting:"a", sort:(index + 1) * 100000, flags:{}}});
  }
  for (const [_id, name, description, source] of weaponExamples) {
    operations.push({type:"put", key:"!items!" + _id,
      value:{_id, name, type:"gear", folder:children.examples[0], system:{description, source}, effects:[]}});
  }
  await db.batch(operations);
  await db.compactRange("", "~");
  console.log("Organized gear by folder:", Object.fromEntries(counts));
} finally {
  await db.close();
}
