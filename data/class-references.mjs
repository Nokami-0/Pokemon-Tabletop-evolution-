export const natureTerrains = [
  ["Grassland", ["Aroma Veil"], "Gain the Quick Capability."],
  ["Forest", ["Flower Veil"], "Gain the Blender Capability."],
  ["Wetlands", ["Mud Dweller"], "Gain immunity to Poisoned."],
  ["Tundra", ["Snow Cloak"], "Gain immunity to Chilled."],
  ["Mountain", ["Rough Skin"], "Gain the Climber Capability."],
  ["Cave", ["Cave Dweller"], "Gain a Boon on Perception checks in darkness."],
  ["Desert", ["Desert Weather"], "Reduce penalties to your Accuracy by 2."],
  ["Ocean", ["Hydration"], "Gain the Swimmer Capability."],
  ["Urban", ["Pickpocket"], "You may substitute Nature Education for Body skill checks in Urban terrain."],
  ["Space", ["Starlight", "Sunglow"], "Gain a Boon on skill checks for traversing or battling in Space terrain."]
];

const natureHazards = [
  ["Dust Trap", "Rough terrain. Enemies entering take an Accuracy penalty equal to twice your Tier Level until the end of their next turn. Blindsense ignores the penalty."],
  ["Pitfall Trap", "Slow terrain. A grounded enemy ending its turn here becomes Tripped and is Weakened while Tripped by this hazard."],
  ["Slow Trap", "Slow terrain. A grounded enemy entering loses 3 Speed combat stages, becomes Slowed, and is Vulnerable while Slowed by this hazard."],
  ["Spiked Trap", "Slow terrain. A grounded enemy passing through loses two HP ticks and cannot regain HP or temporary HP until the end of its next turn."]
];

const referencesByClass = {
  "Bug Specialist": ["Adaptation Techniques"],
  "Chronomancer": ["Temporal Techniques"],
  "Coordinator": ["Innovation Techniques"],
  "Dancer": ["Dance Techniques"],
  "Empath": ["Battle Bond Powers"],
  "Hex Maniac": ["Witchcraft Techniques"],
  "Illusionist": ["Illusion Techniques"],
  "Imposter": ["Imposter Techniques"],
  "Jailbreaker": ["Pokéball Mods", "Homebrew Masterpiece Mods"],
  "Mystic": ["Mystic Techniques"],
  "Occult Researcher": ["Occult Capabilities"],
  "Esper": ["Occult Capabilities"],
  "Operator": ["Styler Mods"],
  "Performer": ["Performer Techniques"],
  "Ranger": ["Ranger Techniques", "Styler Mods"],
  "Rune Master": ["Rune List"],
  "Signer": ["Guardian Sigils"],
  "Swashbuckler": ["Swashbuckler Techniques"],
  "Training Specialist": ["Signature Techniques"]
};

export function classReferences(className, featureName, catalog) {
  if (className === "Nature Researcher") {
    const sections = [];
    if (!featureName || featureName === "Wild Trapper") {
      sections.push({title:"Wild Trapper Hazards", rows:natureHazards.map(([name, text])=>({name, text}))});
    }
    if (!featureName || ["Wild Adaptation", "Natural Connection"].includes(featureName)) {
      sections.push({title:"Wild Adaptation by Terrain", rows:natureTerrains.map(([name, abilities, effect])=>
        ({name, text:`Ability: ${abilities.join(" or ")}. ${effect}`}))});
    }
    return sections.map(section=>({...section, source:{book:"PTE Rule Book", page:97}}));
  }

  if (!className) return [];
  const categories = className.endsWith(" Elementalist") ? ["Elementalist Techniques"] : referencesByClass[className] ?? [];
  return categories.flatMap(title=>{
    const rows = catalog.filter(entry=>entry.kind === "feature" && entry.category === title)
      .map(({name, rules, prerequisites, book, page})=>({name, text:rules, prerequisites, source:{book,page}}));
    return rows.length ? [{title,rows}] : [];
  });
}
