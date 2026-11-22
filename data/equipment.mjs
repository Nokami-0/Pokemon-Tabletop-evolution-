import equipment from "./equipment.json" with {type:"json"};

export {equipment};

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
