import {equipment} from "./equipment.mjs";

const names = text => new Set(text.split("|"));
const essential = names("Basic Baggage|Clothing|Collection Jars|Lighter|Party Pokéballs|Phone|Rations|Towels|Water|Water Filter|Pokedex");
const weapons = names("Training Weapon|Simple Weapon|Fine Weapon|Legendary Weapon|Braced Shield|Heavy Shield|Ranger Styler|Climbing Kit");
const armor = names("Crude Armor|Light Armor|Heavy Armor|Arcane Armor|High Quality Light Armor|High Quality Heavy Armor|Assault Vest|Psionic Vest|Rocky Helmet");
const wearables = names("Artisan Pack|Bardic Instrument|Disguise|Heavy Backpack|Light Backpack|Jewelry|Large Gadget|Seed Bag|Stylish Clothes|Survival Clothes|Gym Badge|Mega Stone|Terastral Crystal|Z Crystal");
const pokemonGear = names("Air Balloon|Analytic Lens|Assault Vest|Berserk Belt|Blessed Relic|Cargo Bag|Covert Cloak|Dodge Scarf|Eject Module|Focus Sash|Jewelry|Large Gadget|Leftovers|Lucky Charm|Pokemon Saddle|Precision Lens|Psionic Vest|Quick Boots|Quick Claw|Razor Claw|Revenge Band|Rocky Helmet|Scope Lens|Small Gadget|Stat Booster|Status Guard|Stylish Clothes|Type Augmentor|Type Booster|Type Brace|Gym Badge|Mega Stone|Terastral Crystal|Z Crystal");
const large = names("Air Balloon|Dodge Scarf|Focus Sash|Rocky Helmet|Pokemon Saddle|Stat Booster|Type Augmentor|Type Booster|Type Brace|Cargo Bag|Heavy Backpack|Large Gadget|Seed Bag|Tent|Artisan Kit");
const small = names("Basic Pokefood|Typed Pokefood|Pokepuff|Pokeball|Shard|Hazard Bag|Simple Poultice|Greater Poultice|Jewelry|Berserk Belt|Rare Candy|Ability Capsule|Gemstone");
const consumable = names("Pokeball|Basic Pokefood|Typed Pokefood|Pokepuff|Shard|Simple Poultice|Greater Poultice|Hazard Bag|Trap Set|Small Gadget|Ability Capsule|Elemental Catalyst|Elemental Enchantment|Evolution Stone|Harnessed Attack|Rare Candy|Tutor Record");

function inferredKeywords(item) {
  const {name,system} = item;
  const overrides = (system.slotKeywords || "").split(/[,;\[\]]+/)
    .map(value=>value.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,""))
    .filter(Boolean);
  if (overrides.length) return new Set(overrides);
  const type = weapons.has(name) || system.weaponSkill ? "weapon" : armor.has(name) ? "armor" : "";
  const existingWeaponSize = system.weaponSkill ? / · (Large|Medium)$/m.exec(system.description || "")?.[1] : undefined;
  const keys = new Set([existingWeaponSize?.toLowerCase() ?? equipment[name]?.size?.toLowerCase() ?? (large.has(name) ? "large" :
    small.has(name) || / Potion$/.test(name) ? "small" : "medium")]);
  if (type) keys.add(`equipment - ${type}`);
  else if (wearables.has(name) || (pokemonGear.has(name) && name !== "Small Gadget")) keys.add("equipment");
  if (essential.has(name)) keys.add("essential");
  if (pokemonGear.has(name)) keys.add("pokemon");
  if (name.startsWith("Ingredients (")) keys.add("resource");
  if (consumable.has(name) || / Potion$/.test(name)) keys.add("consumable");
  if (/ Potion$/.test(name) || ["Basic Pokefood","Typed Pokefood"].includes(name)) keys.add("throwable");
  return keys;
}

export function itemKeywords(item) {
  const keys = inferredKeywords(item);
  const size = item.system.slotSize?.toLowerCase();
  if (["small","medium","large"].includes(size)) {
    for (const keyword of ["small","medium","large"]) keys.delete(keyword);
    keys.add(size);
  }
  return keys;
}

export function itemSlotUsage(item) {
  const {system} = item;
  const keys = itemKeywords(item);
  const size = keys.has("large") ? 2 : 1;
  const quantity = system.quantity ?? 1;
  const equipped = quantity > 0 && system.equipped && !system.inStorage ? size : 0;
  const carried = system.inStorage ? 0 : quantity - Number(Boolean(equipped));
  if (!carried || keys.has("essential") || keys.has("trinket")) return {equipped,regular:0,small:0};
  if (keys.has("resource")) return {equipped,regular:1,small:0};
  if (keys.has("small")) return {equipped,regular:0,small:carried};
  return {equipped,regular:size * carried,small:0};
}

export function itemSlotLabel(item) {
  if (item.system.inStorage) return "Storage · 0 carried slots";
  const {equipped,regular,small} = itemSlotUsage(item);
  return [equipped && `Equipment: ${equipped}`, regular && `Inventory: ${regular}`,
    small && `Inventory: ${small} Small (3 per slot)`].filter(Boolean).join(" · ") || "0 slots";
}

const equippedKeyword = keys => [...keys].some(key=>key === "equipment" || key.startsWith("equipment - "));
export function equipmentEligible(item, pokemon) {
  const keys = itemKeywords(item);
  return equippedKeyword(keys) && (!pokemon || keys.has("pokemon"));
}

export function slotTotals(items,pokemon) {
  let equipment = 0, regular = 0, smallCount = 0, cargo = 0, backpack = 0, stored = 0;
  const equippedNames = new Set();
  const largeTypes = new Set();
  const problems = [];
  for (const item of items) {
    const {system,name} = item;
    const quantity = system.quantity ?? 1;
    if (!quantity) continue;
    if (system.inStorage) { stored += quantity; continue; }
    const keys = itemKeywords(item);
    const size = keys.has("large") ? 2 : 1;
    if (system.equipped) {
      equipment += size;
      const identity = name.trim().toLowerCase() + "|" + (system.description || "").trim();
      if (!equipmentEligible(item,pokemon)) problems.push(`${name} cannot occupy an Equipment Slot.`);
      if (equippedNames.has(identity)) problems.push(`${name} is already equipped with the same effect.`);
      equippedNames.add(identity);
      for (const type of ["weapon","armor"]) {
        if (size !== 2 || !keys.has(`equipment - ${type}`)) continue;
        if (largeTypes.has(type)) problems.push(`Only one Large ${type} can be equipped.`);
        largeTypes.add(type);
      }
      if (!system.impaired && equipmentEligible(item,pokemon)) {
        if (pokemon && name === "Cargo Bag") cargo += 4;
        if (!pokemon && name === "Light Backpack") backpack += 2;
        if (!pokemon && name === "Heavy Backpack") backpack += 6;
      }
    }
    const usage = itemSlotUsage(item);
    if (keys.has("resource")) smallCount += usage.regular * 3;
    else regular += usage.regular;
    smallCount += usage.small;
  }
  const base = pokemon ? 0 : 6;
  const pack = Math.min(backpack,12 - base);
  const inventory = regular + Math.ceil(smallCount / 3);
  const inventoryMax = Math.min(12,base + pack + cargo);
  const equipmentMax = pokemon ? 2 : 4;
  if (equipment > equipmentMax) problems.push(`Equipment uses ${equipment} of ${equipmentMax} slots.`);
  if (inventory > inventoryMax || regular > base + cargo) problems.push(`Inventory exceeds its slots. Backpack slots accept Small items and Resources only.`);
  return {inventory,inventoryMax,equipment,equipmentMax,stored,problems};
}
