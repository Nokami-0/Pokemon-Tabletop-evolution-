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
export function effectiveness(type, defenders, {basic = false} = {}) {
  const index = types.indexOf(type);
  if (index < 0) return 1;
  const has = (row, defender) => row[index].split(" ").includes(defender);
  const ghostException = defender => basic && defender === "Ghost" && has(immune,defender);
  if (defenders.some(defender => has(immune,defender) && !ghostException(defender))) return 0;
  const steps = defenders.reduce((sum,defender) => sum + Number(has(strong,defender)) -
    Number(has(weak,defender) || ghostException(defender)),0);
  return [0.25, 0.5, 1, 1.5, 2][2 + Math.max(-2, Math.min(2, steps))];
}
const matchupLabels = {
  0:"Immune", 0.25:"Doubly resisted", 0.5:"Resisted",
  1:"Neutral", 1.5:"Super effective", 2:"Doubly super effective"
};

export const matchupLabel = factor => `${matchupLabels[factor]} (×${factor})`;

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


export const conditions = {
  blinded:"Blinded", marked:"Marked", vulnerable:"Vulnerable", provoked:"Provoked",
  trapped:"Trapped", tripped:"Tripped", untargetable:"Untargetable", weakened:"Weakened"
};

export function grantedCondition(system, key) {
  if (system.health.value <= 0) return false;
  if (key === "vulnerable") return Boolean(system.afflictions.chilled || system.afflictions.paralyzed ||
    system.conditions?.blinded || system.conditions?.tripped);
  return key === "weakened" && Boolean(system.afflictions.chilled);
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

export const potionVariants = {
  atk:"Attack", spa:"Special Attack", def:"Defense", spd:"Special Defense",
  crit:"Critical Range", accuracy:"Accuracy", evasion:"Evasion", save:"Save Checks"
};

export const boostGear = {
  "Basic Strength Potion": {atk:2,spa:2,crit:2,accuracy:2},
  "Greater Strength Potion": {atk:3,spa:3,crit:3,accuracy:3},
  "Basic Vitality Potion": {def:2,spd:2,evasion:3,save:2},
  "Greater Vitality Potion": {def:3,spd:3,evasion:6,save:4}
};

export const capCombatModifier = value => Math.max(-6,Math.min(6,value));

export function boostPlan(system, gear, variant) {
  if (!Object.hasOwn(gear,variant)) return {error:"Choose a variant on the potion’s item sheet first."};
  if (system.health.value <= 0) return {error:"A fainted combatant cannot benefit from this potion."};
  if ((variant === "def" && system.afflictions.burned) || (variant === "spd" && system.afflictions.poisoned)) {
    return {error:"The active affliction prevents that combat stage from increasing."};
  }
  const stage = Object.hasOwn(system.stages,variant);
  const bucket = stage ? "stages" : "potionBonuses";
  const current = system[bucket][variant];
  const next = stage ? Math.min(6,current + gear[variant]) : current + gear[variant];
  if (next === current) return {error:"That combat stage is already at its maximum."};
  return {updates:{[`system.${bucket}.${variant}`]:next},message:
    `gained +${next-current} ${potionVariants[variant]}${stage ? " combat stages" : " for the scene"}`};
}

export const maladyGear = {
  "Basic Malady Potion": {burned:true,poisoned:true,enraged:true,entranced:true,suppressed:true,wounded:true},
  "Greater Malady Potion": {chilled:true,paralyzed:true,cursed:true,dazed:true}
};

export function maladyPlan(system, gear, variant, types, hit) {
  if (!Object.hasOwn(gear,variant)) return {error:"Choose an affliction on the potion’s item sheet first."};
  if (!hit) return {message:"was missed"};
  if ((afflictionImmunities[variant] || []).some(type => types.includes(type))) {
    return {message:`is immune to ${afflictions[variant]}`};
  }
  if (system.health.value <= 0) return {message:"is fainted"};
  if (system.afflictions[variant]) return {message:`is already ${afflictions[variant]}`};
  return {updates:{[`system.afflictions.${variant}`]:true},message:`became ${afflictions[variant]}`};
}

export function moveActionCost(action) {
  const key = action.trim().toLowerCase().replace(/ action$/,"");
  if (key === "free") return [];
  if (key === "full") return ["standard","swift"];
  return ["standard","swift","movement","reaction"].includes(key) ? [key] : null;
}

export function moveUsePlan({frequency,useScene,lastUseTurn,sceneUses}, turn, scene) {
  const match = /^scene(?:\s*[x×]\s*(\d+))?$/i.exec(frequency.trim());
  const sameScene = useScene === scene;
  const uses = sameScene ? sceneUses : 0;
  const previous = sameScene ? lastUseTurn : -2;
  const cooldown = match || /^eot$/i.test(frequency.trim()) ? 2 : 1;
  if (match && uses >= Number(match[1] || 1)) return {error:"This attack has reached its scene limit."};
  if (turn - previous < cooldown) return {error:"This attack is on cooldown. Advance the actor’s attack turn when its next turn begins."};
  return {updates:{"system.useScene":scene,"system.lastUseTurn":turn,"system.sceneUses":uses + 1}};
}

export function damageUpdate(health, damage) {
  return {"system.health.temp":Math.max(0,health.temp-damage),
    "system.health.value":Math.max(0,health.value-Math.max(0,damage-health.temp))};
}

export function combatDamageUpdate(system, damage) {
  const update = damageUpdate(system.health,damage);
  if (system.health.value > 0 && update["system.health.value"] === 0) {
    for (const key of Object.keys(conditions)) update[`system.conditions.${key}`] = false;
    for (const key of Object.keys(afflictions)) update[`system.afflictions.${key}`] = false;
    for (const [key,value] of Object.entries(system.defaultStages || {})) update[`system.stages.${key}`] = value;
  }
  return update;
}

export function restPlan(system, mode) {
  const {value,max} = system.health;
  if (!["half","full","revive"].includes(mode)) return {error:"Choose a recovery option."};
  if (mode === "revive") {
    if (value !== 0) return {error:"Only a fainted combatant can use fainting recovery."};
    return {value:1};
  }
  if (value === 0) return {error:"Resolve the combatant’s fainting recovery first."};
  if (system.afflictions.wounded) return {error:"A Wounded combatant cannot recover HP."};
  return {value:mode === "full" ? max : Math.min(max,value + Math.floor(max / 2))};
}


export const basicAttackProfiles = {
  unarmed:{label:"Melee",range:"Melee, 1 Target",db:4},
  melee:{label:"Melee weapon",range:"Melee, 1 Target",db:6},
  short:{label:"Short-ranged weapon or Ranger role",range:"6 m, 1 Target",db:4},
  long:{label:"Long-ranged weapon",range:"12 m, 1 Target, no adjacent targets",db:4}
};

export function basicAttackData(category, element, profile, actorTypes) {
  if (!["Physical","Special"].includes(category) || !["Normal",...actorTypes].includes(element) ||
    !Object.hasOwn(basicAttackProfiles,profile)) return null;
  const {range,db} = basicAttackProfiles[profile];
  return {category,element,range,db,ac:4,crit:20,damage:0,accuracyRequired:true,frequency:"At-Will",action:"Standard",
    description:"Confirm range, weapon or role, and any effect that specifically applies to Basic Attacks."};
}

export const initiativeSpeedModifier = speed => Math.max(0,Math.floor(speed / 5));

export function opposedResult(left, right) {
  return Math.sign(left.successes - right.successes || left.total - right.total);
}

export const trainerMeritGoal = level => level <= 5 ? 3 : level <= 10 ? 5 : level <= 15 ? 7 : 10;

export function trainerLevelPlan(system, {skill, milestoneSkills}) {
  if (system.level >= 20) return {error:"Trainers reach their maximum level at 20."};
  if (system.merits < (system.meritGoal || trainerMeritGoal(system.level))) return {error:"The Trainer has not reached the Merit goal."};
  const level = system.level + 1;
  const milestone = [5,10,15].includes(level);
  const skillRanks = {...system.skills};
  const updates = {"system.level":level,"system.merits":0,
    "system.levelPoints":system.levelPoints + (level === 5 || level === 15 ? 15 : 5)};
  const rewards = ["Choose one Class or General Feature."];
  if (milestone && milestoneSkills.length) {
    const rankLimit = level === 5 ? 3 : 4;
    if (milestoneSkills.length !== 2 || new Set(milestoneSkills).size !== 2 ||
      milestoneSkills.some(key=>!Object.hasOwn(skillRanks,key) || skillRanks[key] > rankLimit)) {
      return {error:"Choose two different skills within the milestone rank limit."};
    }
    for (const key of milestoneSkills) updates[`system.skills.${key}`] = ++skillRanks[key];
    rewards.push("Raised " + milestoneSkills.map(key=>skills[Number(key.slice(1))]).join(" and ") + " for the milestone.");
  } else if (milestone) {
    rewards.push("Add Skill Specialty for the milestone.");
  }
  if (skill === "talent") {
    rewards.push("Choose one Talent.");
  } else {
    const rank = skillRanks[skill];
    const minimumLevel = {4:5,5:10,6:15}[rank] ?? 1;
    if (!Object.hasOwn(skillRanks,skill) || level < minimumLevel || (rank === 6 && system.virtuosoSkill)) {
      return {error:"Choose an eligible skill or take a Talent."};
    }
    if (rank === 6) updates["system.virtuosoSkill"] = skill;
    else updates[`system.skills.${skill}`] = rank + 1;
    rewards.push(rank === 6 ? `Raised ${skills[Number(skill.slice(1))]} to Virtuoso.` : `Raised ${skills[Number(skill.slice(1))]} by one rank.`);
  }
  if (system.health.value > 0) updates["system.health.value"] = system.health.value + 5;
  updates["system.progressionHistory"] = [`Level ${level} · ${rewards.join(" ")}`, ...system.progressionHistory.split("\n").filter(Boolean)].slice(0,20).join("\n");
  return {updates};
}

export const pokemonTutorTiers = {10:[1],20:[1,2],30:[1,2],40:[2,3],50:[2,3]};

export function pokemonSkillTrainingDice(system,key) {
  return 2 * (Number(system.trainedSkill1 === key) + Number(system.trainedSkill20 === key));
}

export function pokemonStatReward(system, keys) {
  if (keys.length !== 2 || keys[0] === keys[1] || keys.some(key=>!Object.hasOwn(stats,key))) return null;
  const updates = Object.fromEntries(keys.map(key=>[`system.stats.${key}`,system.stats[key] + 5]));
  if (keys.includes("hp") && system.health.value > 0) updates["system.health.value"] = system.health.value + 15;
  return updates;
}

export function pokemonEvolutionStats(system, previous, next) {
  const scores = Object.fromEntries(Object.keys(stats).map(key=>
    [key,Math.max(0,system.stats[key] - previous.stats[key] + next.stats[key])]));
  const hpDelta = 3 * (scores.hp - system.stats.hp);
  const hp = system.health.value > 0 ? Math.max(1,system.health.value + hpDelta) : 0;
  return {stats:scores,hp};
}

export function pokemonLevelCap(trainerLevel) {
  return Math.min(100,trainerLevel * 5);
}

export function pokemonLevelPlan(level, trainerLevel, method, gain) {
  const allowance = {milestone:5,training:20}[method];
  if (!Number.isInteger(trainerLevel) || trainerLevel < 1) return {error:"Assign a Trainer before using guided progression."};
  if (!allowance || !Number.isInteger(gain) || gain < 1 || gain > allowance) {
    return {error:"Enter a valid level gain for the selected progression method."};
  }
  const next = level + gain;
  if (next > pokemonLevelCap(trainerLevel)) return {error:"That level exceeds the Trainer’s Pokémon cap."};
  return {level:next,points:gain};
}

export function allocateLevelPoints(system, allocation, override = false) {
  const values = Object.keys(stats).map(key=>allocation[key]);
  if (values.some(value=>!Number.isInteger(value) || value < 0)) return {error:"Enter whole, nonnegative point amounts."};
  const spent = values.reduce((sum,value)=>sum+value,0);
  if (spent < 1 || spent > system.levelPoints) return {error:"Choose an allocation within your available points."};
  const assigned = Object.keys(stats).map((key,index)=>system.levelAllocation[key] + values[index]);
  const totalBudget = system.levelPoints + Object.values(system.levelAllocation).reduce((sum,value)=>sum+value,0);
  if (!override && assigned.some(value=>value > Math.ceil(totalBudget / 2))) {
    return {error:"The Glass Cannon limit is half the tracked point budget, rounded up. A GM can approve an exception."};
  }
  const updates = {"system.levelPoints":system.levelPoints-spent};
  for (const [index,key] of Object.keys(stats).entries()) {
    if (!values[index]) continue;
    updates[`system.stats.${key}`] = system.stats[key] + values[index];
    updates[`system.levelAllocation.${key}`] = assigned[index];
  }
  if (system.health.value > 0 && allocation.hp) updates["system.health.value"] = system.health.value + 3 * allocation.hp;
  return {updates};
}

export function walletBalance(balance, amount, mode) {
  if (!Number.isSafeInteger(balance) || balance < 0 ||
      !Number.isSafeInteger(amount) || amount < 1 || !["credit","debit"].includes(mode)) {
    return {error:"Enter a positive whole-number amount."};
  }
  const next = mode === "credit" ? balance + amount : balance - amount;
  if (next < 0) return {error:"The Wallet does not have enough money."};
  if (!Number.isSafeInteger(next)) return {error:"The resulting balance is too large."};
  return {balance:next};
}

const speciesFootprints = {small:1,medium:1,large:2,huge:3,gigantic:4};

export function pokemonTokenFootprint(profile) {
  const size = /\((small\s*-\s*medium|small|smal|medium|large|huge|gigantic)(?=\s*(?:\)|weight\b|$))/i.exec(profile || "")?.[1].toLowerCase();
  if (!size) return null;
  const width = speciesFootprints[size === "smal" || size.includes("-") ? "small" : size];
  return {width,height:width};
}


export const maxSpiritPoints = 6;

export function spiritBalance(current, delta) {
  if (!Number.isInteger(current) || current < 0 || current > maxSpiritPoints || !Number.isInteger(delta)) return null;
  if (current + delta < 0) return null;
  return Math.min(maxSpiritPoints,current + delta);
}
