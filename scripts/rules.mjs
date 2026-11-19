export const stats = {hp:"HP", atk:"Attack", def:"Defense", spa:"Special Attack", spd:"Special Defense", spe:"Speed"};
export const skills = ["Acrobatics","Athletics","Combat","Intimidate","Stealth","Charm","Command","Focus","Guile","Intuition","Perception","General Education","Medicine Education","Nature Education","Occult Education","Pokémon Education","Technology Education"];
export const ranks = ["Pathetic","Untrained","Novice","Adept","Expert","Master / Virtuoso"];
export const types = "Normal Fire Water Electric Grass Ice Fighting Poison Ground Flying Psychic Bug Rock Ghost Dragon Dark Steel Fairy".split(" ");
const strong = ["","Grass Ice Bug Steel","Fire Ground Rock","Water Flying","Water Ground Rock","Grass Ground Flying Dragon","Normal Ice Rock Dark Steel","Grass Fairy","Fire Electric Poison Rock Steel","Grass Fighting Bug","Fighting Poison","Grass Psychic Dark","Fire Ice Flying Bug","Psychic Ghost","Dragon","Psychic Ghost","Ice Rock Fairy","Fighting Dragon Dark"];
const weak = ["Rock Steel","Fire Water Rock Dragon","Water Grass Dragon","Electric Grass Dragon","Fire Grass Poison Flying Bug Dragon Steel","Fire Water Ice Steel","Poison Flying Psychic Bug Fairy","Poison Ground Rock Ghost","Grass Bug","Electric Rock Steel","Psychic Steel","Fire Fighting Poison Flying Ghost Steel Fairy","Fighting Ground Steel","Dark","Steel","Fighting Dark Fairy","Fire Water Electric Steel","Fire Poison Steel"];
const immune = ["Ghost","","","Ground","","","Ghost","Steel","Flying","","Dark","","","Normal","Fairy","","",""];
const bases = [
  [1,6,1],[1,6,3],[1,6,5],[1,8,6],[1,8,8],[2,6,8],[2,6,10],
  [2,8,10],[2,10,10],[3,8,10],[3,10,10],[3,12,10],[4,10,10],[4,10,15],
  [4,10,20],[5,10,20],[5,12,25],[6,12,25],[6,12,30],[6,12,35],[6,12,40],
  [6,12,45],[6,12,50],[6,12,55],[6,12,60],[7,12,65],[8,12,70],[8,12,80]
];
export function effectiveness(type, defenders) {
  const index = types.indexOf(type);
  if (index < 0) return 1;
  const has = (row, defender) => row[index].split(" ").includes(defender);
  if (defenders.some(defender => has(immune, defender))) return 0;
  const steps = defenders.reduce((sum, defender) => sum + Number(has(strong, defender)) - Number(has(weak, defender)), 0);
  return [0.25, 0.5, 1, 1.5, 2][2 + Math.max(-2, Math.min(2, steps))];
}
export const tier = (level, pokemon) => level >= (pokemon ? 50 : 10) ? 3 : level >= (pokemon ? 21 : 5) ? 2 : 1;
export const maxHP = (level, hp, pokemon) => level * (pokemon ? 1 : 5) + hp * 3 + 10;
export const evasion = value => Math.max(0, Math.min(6, Math.floor(value / 5)));
export const successes = (dice, threshold) => dice.reduce((total, value) => total + (value === 6 ? 2 : Number(value >= threshold)), 0);
export function damageFormula(db, crit, offense, modifier) {
  const [dice, faces, flat] = bases[Math.max(1, Math.min(28, db)) - 1];
  const multiplier = crit ? 2 : 1;
  const bonus = flat * multiplier + offense + modifier;
  return `${dice * multiplier}d${faces} ${bonus < 0 ? "-" : "+"} ${Math.abs(bonus)}`;
}


export function stagedStat(base, stage = 0) {
  const clamped = Math.max(-6,Math.min(6,stage));
  return Math.floor(base * (10 + clamped * (clamped > 0 ? 2 : 1)) / 10);
}


export const afflictions = {
  burned:"Burned", chilled:"Chilled", paralyzed:"Paralyzed", poisoned:"Poisoned", slowed:"Slowed", wounded:"Wounded",
  cursed:"Cursed", dazed:"Dazed", disabled:"Disabled", drowsy:"Drowsy", enraged:"Enraged",
  entranced:"Entranced", suppressed:"Suppressed"
};

export const afflictionImmunities = {burned:["Fire"],chilled:["Ice"],paralyzed:["Electric"],poisoned:["Poison","Steel"]};

export function afflictionTickDamage(maxHP, active, movedFar) {
  const ticks = Number(Boolean(active.burned)) + Number(Boolean(active.poisoned)) + (active.wounded ? (movedFar ? 2 : 1) : 0);
  return Math.floor(maxHP / 10) * ticks;
}

export const recoveryGear = {
  "Basic Healing Potion": {heal:[3,50], revive:[1,20], cure:1},
  "Greater Healing Potion": {heal:[5,100], revive:[3,50], cure:2},
  "Simple Poultice": {heal:[2,50], cure:1},
  "Greater Poultice": {heal:[4,100], cure:2}
};

export function recoveryPlan(system, gear, mode, chosen = []) {
  const {value,max} = system.health;
  if (gear.revive && system.healingPotionUsed) return {error:"This combatant already received a healing potion this scene."};
  if (mode === "cure") {
    const keys = [...new Set(chosen)];
    if (!value || !keys.length || keys.length > gear.cure ||
      keys.some(key => !Object.hasOwn(afflictions,key) || !system.afflictions[key])) {
      return {error:`Choose up to ${gear.cure} active afflictions on a conscious combatant.`};
    }
    return {updates:Object.fromEntries(keys.map(key => [`system.afflictions.${key}`,false])),
      message:`cured ${keys.map(key => afflictions[key]).join(", ")}`};
  }
  if (!["heal","revive"].includes(mode) || !gear[mode]) return {error:"Choose a recovery effect."};
  if (system.afflictions.wounded) return {error:"A Wounded combatant cannot recover HP."};
  if (mode === "revive" && value !== 0) return {error:"Only a fainted combatant can be revived."};
  if (mode === "heal" && (!value || value >= max)) return {error:"HP recovery requires a conscious combatant below maximum HP."};
  const [ticks,minimum] = gear[mode];
  const restored = Math.min(max,value + Math.max(Math.floor(max / 10) * ticks,minimum));
  return {updates:{"system.health.value":restored},
    message:mode === "revive" ? `revived at ${restored} HP` : `recovered ${restored - value} HP`};
}
