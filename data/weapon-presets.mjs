import {attackCatalog} from "./attacks.mjs";
import {catalogItemData} from "./item-data.mjs";
import {skills,ranks} from "../scripts/rules.mjs";
import {eligibleWeaponAttack,weaponAttackStats,weaponKeywords,weaponQualities,weaponTiers} from "../scripts/weapons.mjs";

// Example builds using PTE Rule Book pp. 220–223.
const presets = [
  ["practice-sword","Practice Sword","Training","Martial","Melee","Medium","Combat",[],["Double Strike"]],
  ["practice-staff","Practice Staff","Training","Martial","Melee","Large","Combat",[],["Braced Strike","Beatdown"]],
  ["sling","Sling","Training","Martial","Short Ranged","Medium","Perception",[],["Take Aim"]],
  ["apprentice-wand","Apprentice Wand","Training","Arcane","Short Ranged","Medium","Occult Education",[],["Energy Blast"]],
  ["shortsword","Shortsword","Simple","Martial","Melee","Medium","Combat",["Sharp"],["Double Strike","Quick Draw"]],
  ["mace","Iron Mace","Simple","Martial","Melee","Medium","Combat",["Blunt"],["Beatdown","Braced Strike"]],
  ["spear","Long Spear","Simple","Martial","Melee","Large","Combat",["Extended"],["Pierce","Braced Strike","Sweeping Strike"]],
  ["hunting-bow","Hunting Bow","Simple","Martial","Long Ranged","Large","Perception",["Ammo"],["Bullseye","Rapid Shot","Trick Shot"]],
  ["rapier","Duelist’s Rapier","Fine","Martial","Melee","Medium","Acrobatics",["Finesse","Piercing"],["Pierce","Quick Draw","Parry"]],
  ["battleaxe","Battleaxe","Fine","Martial","Melee","Large","Athletics",["Sharp","Sundering"],["Beatdown","Wounding Strike","Slicing Strike","Sweeping Strike"]],
  ["crossbow","Barbed Crossbow","Fine","Martial","Long Ranged","Large","Perception",["Ammo","Barbed"],["Hooked Shot","Rapid Shot","Trick Shot","Deadly Strike"]],
  ["mending-wand","Mending Wand","Fine","Arcane","Short Ranged","Medium","Medicine Education",["Mending","Enhancing"],["Healing Aura","Energy Blast","Heal Pulse (Weapon)"]],
  ["greatsword","Champion’s Greatsword","Legendary","Martial","Melee","Large","Athletics",["Sharp","Oversized"],["Braced Strike","Double Strike","Slicing Strike","Sweeping Strike","Wide Slash","Fierce Assault"]],
  ["warhammer","Titan’s Warhammer","Legendary","Martial","Melee","Large","Athletics",["Blunt","Oversized"],["Beatdown","Braced Strike","Reckless Strike","Cone of Force","Titanic Slam","Grand Rupture"]],
  ["longbow","Masterwork Longbow","Legendary","Martial","Long Ranged","Large","Perception",["Ammo","Piercing"],["Take Aim","Rapid Shot","Trick Shot","Deadly Strike","Deadly Volley","Impaling Shot"]],
  ["sages-staff","Sage’s Staff","Legendary","Arcane","Long Ranged","Large","Occult Education",["Enhancing","Homing"],["Arcane Fury","Energy Blast","Empowerment","Missile Shot","Limit Break","Arcane Storm"]],
  ["barbed-mace","Barbed Mace","Fine","Martial","Melee","Medium","Combat",["Barbed","Blunt"],["Beatdown","Braced Strike","Backswing"]],
  ["serrated-saber","Serrated Saber","Fine","Martial","Melee","Medium","Combat",["Serrated","Sharp"],["Wounding Strike","Quick Draw","Slicing Strike"]],
  ["concealed-dagger","Concealed Dagger","Simple","Martial","Melee","Medium","Stealth",["Concealed"],["Cheap Shot","Pierce"]],
  ["piercing-estoc","Piercing Estoc","Fine","Martial","Melee","Medium","Combat",["Piercing","Sharp"],["Pierce","Double Strike","Parry"]],
  ["extended-glaive","Extended Glaive","Fine","Martial","Melee","Large","Athletics",["Extended","Sharp"],["Pierce","Braced Strike","Sweeping Strike","Slicing Strike"]],
  ["sundering-maul","Sundering Maul","Legendary","Martial","Melee","Large","Athletics",["Sundering","Blunt"],["Beatdown","Braced Strike","Backswing","Reckless Strike","Titanic Slam","Grand Rupture"]],
  ["throwing-hatchet","Throwing Hatchet","Simple","Martial","Melee","Medium","Combat",["Throwable"],["Quick Draw","Wounding Strike"]],
  ["homing-scepter","Homing Scepter","Fine","Arcane","Short Ranged","Medium","Occult Education",["Homing","Enhancing"],["Energy Blast","Resonance Beam","Missile Shot"]],
  ["spark-orb","Spark Orb","Simple","Arcane","Short Ranged","Medium","Occult Education",["Homing"],["Energy Blast","Resonance Beam"]],
  ["warding-tome","Warding Tome","Fine","Arcane","Short Ranged","Medium","Occult Education",["Enhancing","Sundering"],["Bane","Energy Blast","Mystic Ward"]],
  ["restoration-rod","Restoration Rod","Legendary","Arcane","Short Ranged","Large","Medicine Education",["Mending","Enhancing"],["Healing Aura","Energy Blast","Heal Pulse (Weapon)","Empowerment","Recover (Weapon)","Limit Break"]],
  ["runic-blade","Runic Blade","Fine","Arcane","Melee","Medium","Occult Education",["Enhancing","Sundering"],["Arcane Fury","Braced Strike","Magical Burst"]],
  ["aether-lantern","Aether Lantern","Training","Arcane","Short Ranged","Medium","Occult Education",[],["Healing Aura"]],
  ["astral-focus","Astral Focus","Legendary","Arcane","Long Ranged","Medium","Occult Education",["Enhancing","Homing"],["Arcane Fury","Resonance Beam","Missile Shot","Spirit Lance"]],
  ["training-sidearm","Training Sidearm","Training","Martial","Short Ranged","Medium","Combat",[],["Take Aim"]],
  ["training-carbine","Training Carbine","Training","Martial","Long Ranged","Large","Perception",[],["Take Aim","Bullseye"]],
  ["service-pistol","Service Pistol","Simple","Martial","Short Ranged","Medium","Combat",["Ammo"],["Quick Draw","Rapid Shot"]],
  ["patrol-carbine","Patrol Carbine","Simple","Martial","Long Ranged","Large","Perception",["Ammo"],["Salvo","Rapid Shot","Trick Shot"]],
  ["precision-rifle","Precision Rifle","Fine","Martial","Long Ranged","Large","Perception",["Ammo","Piercing"],["Take Aim","Bullseye","Deadly Strike","Trick Shot"]],
  ["magitech-pistol","Magitech Pistol","Fine","Arcane","Short Ranged","Medium","Technology Education",["Ammo","Homing"],["Energy Blast","Rapid Shot","Missile Shot"]],
  ["vanguard-rifle","Vanguard Rifle","Legendary","Martial","Long Ranged","Large","Perception",["Ammo","Sundering"],["Bullseye","Rapid Shot","Trick Shot","Deadly Strike","Deadly Volley","Triple Strike"]],
  ["astral-blaster","Astral Blaster","Legendary","Arcane","Long Ranged","Large","Technology Education",["Homing","Enhancing"],["Energy Blast","Resonance Beam","Missile Shot","Empowerment","Spirit Lance","Limit Break"]]
];

const attacks = new Map(attackCatalog.filter(entry=>entry.category === "Weapon Attacks").map(entry=>[entry.name,entry]));

function weaponPreset([key,name,qualityName,type,range,size,skill,keywords,attackNames]) {
  const weapon = {type,range,size,keywords};
  const quality = weaponQualities[qualityName];
  const selected = attackNames.map(name=>attacks.get(name));
  if (skills.indexOf(skill) < 0 || !quality?.[size] || keywords.length > quality.keywords ||
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

export const weaponPresets = new Map(presets.map(row=>[row[0],weaponPreset(row)]));
