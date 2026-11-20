import {skills} from "./rules.mjs";

export const normalizeRequirement = value => value.toLowerCase().normalize("NFD")
  .replace(/\p{Diacritic}/gu,"").replace(/[’‘]/g,"'").replace(/\s+/g," ").trim();

const ranks = {pathetic:1,untrained:2,novice:3,adept:4,expert:5,master:6};
const rankPattern = Object.keys(ranks).join("|");
const aliases = ["general","medicine","nature","occult","pokemon","technology"]
  .map(label=>label+" education");
const short = ["gen","med","nature","occult","poke","tech"];
const skillIds = new Map(skills.map((name,index)=>[normalizeRequirement(name),index]));
short.forEach((name,index)=>skillIds.set(name+" edu",skillIds.get(aliases[index])));
const all = values => values.includes(false) ? false : values.includes(null) ? null : true;
const any = values => values.includes(true) ? true : values.includes(null) ? null : false;

export function requirementResult(texts, context) {
  const lines = texts.map(normalizeRequirement);
  function evaluate(text) {
    const level = /^level (\d+)\+?$/.exec(text);
    if (level) return context.level >= Number(level[1]);
    const count = /^(\d+) (.+?) features?$/.exec(text);
    if (count && context.classes.has(count[2])) return (context.featureCounts.get(count[2]) || 0) >= Number(count[1]);

    const suffix = new RegExp(`^(.+?) at (${rankPattern})(?: rank)?$`).exec(text);
    if (suffix) {
      const list = suffix[1].split(/\s*,\s*(?:or\s+)?|\s+or\s+/);
      if (list.every(name=>skillIds.has(name))) return any(list.map(name=>context.skills[`s${skillIds.get(name)}`] >= ranks[suffix[2]]));
    }
    const and = text.split(/\s*,\s*|\s+and\s+/);
    if (and.length > 1) {
      // A comma inside an unrecognized skill list may be a choice, so defer these to the GM.
      if (text.includes(" at ") && !text.includes(" and ")) return null;
      return all(and.map(evaluate));
    }
    const skill = new RegExp(`^(${rankPattern}) (.+)$`).exec(text);
    if (skill) {
      const alternatives = skill[2].split(/\s+or\s+/);
      return any(alternatives.map(name=>{
        if (skillIds.has(name)) return context.skills[`s${skillIds.get(name)}`] >= ranks[skill[1]];
        return /^(?:pathetic|untrained|novice|adept|expert|master) /.test(name) ? evaluate(name) : null;
      }));
    }
    if (context.owned.has(text)) return true;
    const alternatives = text.split(/\s+or\s+/);
    if (alternatives.length > 1) return any(alternatives.map(evaluate));
    return context.catalogNames.has(text) ? false : null;
  }
  if (!lines.length) return true;
  const clauses = [];
  let alternatives = [];
  for (const line of lines) {
    alternatives.push(evaluate(line.replace(/\s*\[or\]$/,"")));
    if (!line.endsWith("[or]")) {
      clauses.push(any(alternatives));
      alternatives = [];
    }
  }
  if (alternatives.length) clauses.push(null);
  return all(clauses);
}

export function normalizeAbilityName(value) {
  const name = normalizeRequirement(value);
  return ({beauitful:"beautiful", "lateral sense":"lateral senses", omean:"omen",
    "mycellium might":"mycelium might"})[name] || name;
}

export function speciesAbilityNames(profile) {
  return (profile?.abilities || "").split(",").map(name=>name.trim()).filter(Boolean);
}

export function normalizeMoveName(value) {
  const name = normalizeRequirement(value);
  return ({vicegrip:"vice grip","haunting breeze":"haunted breeze"})[name] || name;
}

export function speciesRequirement(entry, profile, level) {
  if (!profile) return {review:"Set the Pokémon’s species using the Pokédex or have the GM confirm this grant."};
  const name = entry.category === "Pokémon Abilities" ? normalizeAbilityName(entry.name) : normalizeMoveName(entry.name);
  if (entry.category === "Pokémon Abilities") {
    if (speciesAbilityNames(profile).some(ability=>normalizeAbilityName(ability) === name)) return {};
    return {review:"This ability is outside the recorded species list. A GM must verify an alternate grant."};
  }
  if (profile.starting.some(move=>normalizeMoveName(move)===name)) return {};
  const levels = profile.levelUp.flatMap(line=>{
    const match = /^(\d+) · (.+?)(?:\s+-\s+[^-]+)?$/.exec(line);
    return match && normalizeMoveName(match[2]) === name ? [Number(match[1])] : [];
  });
  if (levels.some(value=>level >= value)) return {};
  const tutor = profile.tutor.some(line=>line.replace(/^(?:Unique|Generic):\s*/i,"").split(",").map(normalizeMoveName).includes(name));
  if (tutor) {
    const groups = profile.tutor;
    const standard = groups.length === 6 && groups.every((line,index)=>(index % 2 ? /^Generic:/i : /^Unique:/i).test(line));
    if (standard) {
      const tier = groups.findIndex(line=>line.replace(/^(?:Unique|Generic):\s*/i,"").split(",").map(normalizeMoveName).includes(name));
      const required = [10,20,40][Math.floor(tier / 2)];
      if (level < required && !levels.length) return {review:`Species tutoring for this move starts at level ${required}. Verify an alternate grant if adding it now.`};
    }
    return {review:"Verify the tutor tier, an available tutor selection, or an alternate grant."};
  }
  if (levels.length) return {error:`Requires Pokémon level ${Math.min(...levels)} for this learnset move.`};
  return {review:"This move is outside the recorded starting and level-up list. A GM must verify its source."};
}


export function evolutionOptions(source, profiles) {
  const byName = new Map(Array.from(profiles,profile=>[normalizeRequirement(profile.name),profile]));
  const links = [...(source.evolution || "").matchAll(/([^()>]+?)\s*\(([^()]*)\)(\s*>\s*)?/g)];
  const options = new Map();
  for (const [index,link] of links.entries()) {
    if (!link[3] || normalizeRequirement(link[1]) !== normalizeRequirement(source.name)) continue;
    const next = links[index+1];
    if (!next || !/^\d+$/.test(next[2].trim())) continue;
    const profile = byName.get(normalizeRequirement(next[1]));
    if (profile && profile.page !== source.page) options.set(profile.page,{profile,level:Number(next[2])});
  }
  return [...options.values()];
}
