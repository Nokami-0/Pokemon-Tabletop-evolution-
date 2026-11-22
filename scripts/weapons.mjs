import weaponQualities from "../data/weapon-qualities.json" with {type:"json"};

export {weaponQualities};

export const weaponKeywords = {
  Ammo:weapon=>weapon.range !== "Melee",
  Barbed:weapon=>weapon.type === "Martial",
  Blessed:()=>true,
  Blunt:weapon=>weapon.type === "Martial",
  Concealed:weapon=>weapon.size === "Medium",
  Cursed:()=>true,
  Defensive:()=>true,
  Elemental:()=>true,
  Enhancing:weapon=>weapon.type === "Arcane",
  Extended:weapon=>weapon.range === "Melee",
  Finesse:weapon=>weapon.type === "Martial",
  Homing:weapon=>weapon.type === "Arcane",
  "Life Stealing":()=>true,
  Mending:weapon=>weapon.type === "Arcane",
  Oversized:weapon=>weapon.size === "Large",
  Piercing:weapon=>weapon.type === "Martial",
  Serrated:weapon=>weapon.type === "Martial",
  Sharp:weapon=>weapon.type === "Martial",
  Shifting:()=>true,
  Soulbound:()=>true,
  Sundering:()=>true,
  Throwable:()=>true
};

export const weaponTiers = ["Basic Weapon","Advanced Weapon","Master Weapon"];

export function eligibleWeaponAttack(weapon, attack) {
  const tags = new Set([weapon.type,weapon.size,weapon.range,...weapon.keywords]);
  if (weapon.range !== "Melee") tags.add("Ranged");
  if (tags.has("Life Stealing")) tags.add("Lifesteal");
  if (!attack.requirements || attack.requirements === "--") return true;
  return attack.requirements.replace(/ Weapons Only$/i,"").split(/\s+or\s+|,\s*/i).some(alternative=>{
    const required = alternative.replace(/[\[\]]/g,"").split(/\s+and\s+/i);
    return required.every(tag=>tags.has(tag.trim()));
  });
}

export function weaponAttackStats(weapon, input) {
  const melee = weapon.range === "Melee";
  const range = melee ? (weapon.keywords.includes("Extended") ? "2m" : "Melee") : weapon.range === "Short Ranged" ? "6m" : "12m";
  let attackRange = input.range.replace(/\bWR\b/g,range);
  if (melee) attackRange = attackRange.replace(/\b(?:(?:Ranged|Close) )?Blast\b/g,"Close Blast");
  else attackRange = attackRange.replace(/\b(?:(?:Ranged|Close) )?Blast\b/g,"Ranged Blast");
  const damaging = input.category !== "Status";
  return {...input,range:attackRange,
    category:damaging ? (weapon.type === "Martial" ? "Physical" : "Special") : "Status",
    db:damaging && input.db > 0 && melee ? Math.min(28,input.db + 2) : input.db,
    ...(damaging && weapon.keywords.includes("Sharp") ? {crit:input.crit < 20 ? Math.max(1,input.crit - 1) : 18} : {})};
}
