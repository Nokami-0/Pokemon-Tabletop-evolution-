import {attackCatalog} from "./attacks.mjs";
import {catalogItemData} from "./item-data.mjs";
import {skills,ranks} from "../scripts/rules.mjs";
import {eligibleWeaponAttack,weaponAttackStats,weaponKeywords,weaponQualities,weaponTiers} from "../scripts/weapons.mjs";

// Example builds using PTE Rule Book pp. 220–223.
import presets from "./weapon-builds.json" with {type:"json"};

const attacks = new Map(attackCatalog.filter(entry=>entry.category === "Weapon Attacks").map(entry=>[entry.name,entry]));

function weaponPreset({id:key,name,quality:qualityName,type,range,size,skill,keywords,attacks:attackNames}) {
  const weapon = {type,range,size,keywords};
  const quality = weaponQualities[qualityName];
  const selected = attackNames.map(name=>attacks.get(name));
  if (!key || !name || !["Martial","Arcane"].includes(type) ||
    !["Melee","Short Ranged","Long Ranged"].includes(range) ||
    new Set(keywords).size !== keywords.length || new Set(attackNames).size !== attackNames.length ||
    skills.indexOf(skill) < 0 || !quality?.[size] || keywords.length > quality.keywords ||
    keywords.some(keyword=>!weaponKeywords[keyword]?.(weapon)) ||
    selected.some(entry=>!entry || !eligibleWeaponAttack(weapon,entry)) ||
    weaponTiers.some((tier,index)=>selected.filter(entry=>entry.tier === tier).length > quality[size][index])) {
    throw Error(`Invalid weapon preset: ${name}`);
  }
  const price = quality.price / (size === "Medium" ? 2 : 1);
  const description = [
    `${qualityName} · ${type} · ${range} · ${size}`,
    quality.rank ? `Qualifying skill: ${skill} (${ranks[quality.rank - 1]} or higher).` : "No qualifying skill rank required.",
    `Keywords: ${keywords.join(", ") || "None"}.`,
    `Grants: ${attackNames.join(", ")}.`,
    range === "Long Ranged" ? "Cannot target adjacent enemies." : "",
    "Weapon construction and keyword rules: PTE Rule Book, pp. 220–223."
  ].filter(Boolean).join("\n");
  return {key,qualityName,gear:{name,type:"gear",flags:{"pokemon-tabletop-evolution":{weaponPreset:key,weaponBuild:{quality:qualityName,...weapon}}},
    system:{price:`$${price.toLocaleString("en-US")}`,description,source:"PTE Rule Book, pp. 220–223",
      slotKeywords:`${size}, Equipment - Weapon`,weaponSkill:`s${skills.indexOf(skill)}`,weaponRank:quality.rank,weaponRange:range}},
    moves:selected.map(entry=>{
      const move = catalogItemData(entry);
      return {...move,name:`${entry.name} (${name})`,system:{...weaponAttackStats(weapon,move.system),slotExempt:true}};
    })};
}

export const weaponPresets = new Map(presets.map(row=>[row.id,weaponPreset(row)]));

if (weaponPresets.size !== presets.length) throw Error("Weapon build IDs must be unique.");
