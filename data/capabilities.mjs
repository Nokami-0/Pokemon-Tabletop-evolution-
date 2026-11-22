import capabilityGroups from "./capabilities.json" with {type:"json"};

export {capabilityGroups};

const mentalAfflictions = ["cursed","dazed","disabled","drowsy","enraged","entranced","suppressed"];
const free = ["Use the basic effect",0];

export function capabilityUses(name, tier, afflictions = {}) {
  const impaired = mentalAfflictions.filter(key=>afflictions[key]).length;
  const tierCost = Math.max(0,3 - tier);
  const options = ({
    Flier:[["Become Airborne",0],["Stay Airborne at turn end",1]],
    Phaser:[["Phase through terrain",impaired,"additionalDisabled"]],
    Teleporter:[["Teleport",impaired,"additionalDisabled"]],
    Blindsense:[free,["Enhance a sense for up to 30 minutes",1]],
    Groundshaper:[["Change terrain within 2m",0],["Extend terrain shaping",1],["Create fragile blocking terrain",2]],
    Invisibility:[["Become invisible or visible",0],["Maintain concentration instead of a Focus check",1]],
    "Shadow Meld":[["Merge into a shadow (up to 10 minutes outside combat)",0],
      ["Stay merged for additional hours outside combat",1,"hours"],["Emerge from the shadow",0]],
    Telekinetic:[free,["Gain +2 Power for one hour",1]],
    "Dream Reader":[["View an adjacent sleeper’s dream",0],
      ["Shape a touched sleeper’s dream",1],["Project a touched sleeper’s dream",1]],
    Empath:[free,["Sense deeper emotions with a Focus check",1]],
    Illusionist:[free,["Lift one illusion restriction",tierCost]],
    "Mind Weaver":[["Read memories from the past 24 hours",0],
      ["Reach older memories after winning by 2 or more",2],["Reach older memories through a Downtime action",0]],
    Premonition:[free,["Clarify the vision",1,"sp"]],
    Telepath:[free,["Attempt to read deeper thoughts after a successful read",tierCost]]
  })[name];
  return (options ?? [free]).map(([label,cost,quantity])=>({label,cost,quantity}));
}

export function capabilitySpiritCost(option, amounts, disabled) {
  if (option.quantity === "additionalDisabled" && disabled) {
    const extra = amounts.additionalDisabled;
    return Number.isInteger(extra) && extra >= 0 && extra <= 2 ? option.cost + extra : null;
  }
  if (option.quantity === "hours" || option.quantity === "sp") {
    const count = amounts[option.quantity];
    return Number.isInteger(count) && count >= 1 && count <= 6 ? option.cost * count : null;
  }
  return option.cost;
}
