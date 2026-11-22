export const equipment = {
  "Crude Armor": {group:"Armor", size:"Medium", reduction:5},
  "Light Armor": {group:"Light Armor", size:"Large", reduction:10, level:5},
  "High Quality Light Armor": {group:"Light Armor", size:"Medium", reduction:10, level:15},
  "Heavy Armor": {group:"Heavy Armor", size:"Large", reduction:10, stage:"def", movement:-2, level:10},
  "High Quality Heavy Armor": {group:"Heavy Armor", size:"Large", reduction:20, level:15},
  "Arcane Armor": {group:"Armor", size:"Large", reduction:10, stage:"spd", movement:-2, level:10},
  "Assault Vest": {group:"Armor", size:"Large", rules:"After damage is calculated for a physical hit, gain one HP tick of temporary HP. Pokémon equipment."},
  "Rocky Helmet": {group:"Armor", size:"Large", rules:"When targeted by a melee attack, its attacker loses one HP tick. Pokémon equipment."},
  "Braced Shield": {group:"Shields", size:"Medium", shield:true},
  "Heavy Shield": {group:"Shields", size:"Large", shield:true, level:5},
  "Precision Lens": {accuracy:2, size:"Medium", rules:"Gain +2 Accuracy. Pokémon equipment."},
  "Scope Lens": {crit:1, size:"Medium", rules:"Expand your critical hit range by 1. Pokémon equipment."},
  "Quick Boots": {movement:2, size:"Medium", rules:"Gain +2 Movement. You may act at the start of each round. If multiple combatants can do so, resolve priority with Luck plus Speed. Pokémon equipment."},
  "Analytic Lens": {size:"Medium", rules:"Gain +1 to Effect Ranges. Pokémon equipment."},
  "Leftovers": {size:"Medium", rules:"Spend a Swift and Movement action to choose one HP tick of healing or temporary HP. Pokémon equipment."},
  "Psionic Vest": {size:"Large", rules:"After damage is calculated for a special hit, gain one HP tick of temporary HP. Pokémon equipment."}
};

export function equipmentDescription(name) {
  const item = equipment[name];
  if (!item) return;
  const effects = [
    item.reduction && `Gain ${item.reduction} Damage Reduction.`,
    item.stage && `Set the default ${item.stage === "def" ? "Defense" : "Special Defense"} Combat Stage to +1.`,
    item.movement < 0 && `Reduce default Movement by ${-item.movement} m.`,
    item.shield && "When you Defend an ally, it gains Damage Reduction equal to your Tier Value until your next turn while it remains adjacent.",
    name === "Heavy Shield" && "Spend a Swift action to gain Damage Reduction equal to your Tier Value for one full round.",
    item.rules
  ].filter(Boolean);
  return [item.size, item.level && `Requires level ${item.level} to equip`, "While equipped", ...effects].filter(Boolean).join("\n");
}
