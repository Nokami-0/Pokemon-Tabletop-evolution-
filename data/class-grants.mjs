import settings from "./class-grants.json" with {type:"json"};
import {natureTerrains} from "./class-references.mjs";

const attack = name => ({kind:"move",name});
const feature = name => ({kind:"feature",name});
const capability = name => ({kind:"capability",name});
const choices = (id,label,count,options,minFeatures = 0) => ({id,label,count,options,minFeatures});
const attacks = (id,label,n,names,minFeatures) => choices(id,label,n,names.map(name=>[attack(name)]),minFeatures);
const fixed = (...rewards) => ({id:"fixed",label:"Grant benefits",count:0,options:[rewards]});
const {elementalAttackTiers} = settings;
const reviewedGrants = new Map(Object.entries({...settings.reviewedGrants,
  "Nature Researcher":[choices("naturewalk","Choose a Naturewalk terrain",1,natureTerrains.map(([terrain])=>[capability(`Naturewalk (${terrain})`)]))],
  "Natural Connection":[choices("naturewalk","Choose an additional Naturewalk terrain",1,natureTerrains.map(([terrain])=>[capability(`Naturewalk (${terrain})`)]))],
  "Wild Adaptation":[choices("adaptation","Choose an ability for a Naturewalk terrain",1,natureTerrains.flatMap(([terrain,abilities])=>
    abilities.map(name=>[{...feature(name),terrain}])) )],
}));

export function advancementGrants(entry, effect, lookup) {
  if (entry.kind === "class" && (elementalAttackTiers[entry.name] || entry.name === "Infernal Elementalist")) {
    const tiers = elementalAttackTiers[entry.name] ?? elementalAttackTiers["Dark Elementalist"]
      .map((tier,index)=>[...tier,...elementalAttackTiers["Fire Elementalist"][index]]);
    return [1,5,10].map((level,index)=>({
      ...attacks(`tier${index+1}`,`Choose level ${level} attacks`,2,
        [...new Set(tiers.slice(0,index+1).flat())]),
      minLevel:level,requiresPrevious:index ? `tier${index}` : null
    }));
  }
  if (entry.kind === "feature" && entry.category.endsWith("Elementalist") && entry.name.endsWith("Tactics")) {
    const list = /(?:listed below:|from)\s*(?:»\s*)?([^\n]+)/i.exec(effect || "");
    if (list && /Level 15/i.test(effect)) {
      const options = list[1].replace(/\s+or\s+/g,", ").replace(/[.!]$/,"")
        .split(",").map(name=>feature(name.trim())).filter(lookup).map(reward=>[reward]);
      if (options.length) return [5,15].map(level=>({
        ...choices(`level${level}`,`Choose level ${level} ability`,1,options),minLevel:level,
        requiresPrevious:level === 15 ? "level5" : null
      }));
    }
  }

  const reviewed = reviewedGrants.get(entry.name);
  if (reviewed) return reviewed;
  // Only an unconditional, named learner in the first effect sentence is safe to grant automatically.
  const found = /^Effect: You (learn|gain) the ([\p{L}\p{N} ’'-]+?) (Attack|Ability|Capability)\./u.exec(effect || "");
  if (!found) return [];
  const [, ,name,type] = found;
  const reward = type === "Attack" ? attack(name) : type === "Ability" ? feature(name) : capability(name);
  return lookup(reward) ? [fixed(reward)] : [];
}
