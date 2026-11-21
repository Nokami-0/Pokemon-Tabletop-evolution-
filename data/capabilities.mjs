export const capabilityGroups = [
  {name:"Movement",entries:[
    ["Quick",176,"Base Movement is 8m."],
    ["Slow",176,"Base Movement is 4m."],
    ["Burrower",176,"Spend a Swift action with Movement to reach a space through connected diggable ground without triggering reactions."],
    ["Climber",176,"Climb vertical surfaces without movement penalties or checks. You may stop on the surface below 4m."],
    ["Flier",176,"Spend a Swift action when moving to become Airborne, generally up to 4m. At the end of each turn, pay 1 SP to remain airborne or land. Includes Glider."],
    ["Glider",176,"Avoid falling damage when able to glide."],
    ["Grounded",176,"Cannot use the Jump maneuver."],
    ["Jumper",176,"Jump up to full Movement."],
    ["Phaser",177,"Spend a Swift action when moving to travel through blocking terrain without ending there. Mental afflictions cost 1 SP each to bypass."],
    ["Swimmer",177,"Treat Ocean terrain as basic terrain in water or underwater."],
    ["Teleporter",177,"Spend Swift and Movement to reach a visible spot within Movement range without triggering reactions. Land on a surface unless you have Flier. Mental afflictions cost 1 SP each to bypass."]
  ]},
  {name:"Combat",entries:[
    ["Blender",177,"Hide as a Swift action and gain a Stealth Boon when you can blend in."],
    ["Blindsense",177,"Gain Darkvision and immunity to Blinded. Spend 1 SP to enhance a relevant sense for up to 30 minutes."],
    ["Darkvision",177,"See through darkness and ignore its accuracy penalties."],
    ["Form Change",177,"Use separate sheets for forms. Keep total HP stat and external base-stat changes consistent across forms."],
    ["Groundshaper",177,"As a Swift action change nearby terrain within 2m. SP can extend the area or add fragile blocking terrain."],
    ["Invisibility",177,"Spend Swift and Movement to become invisible. Enemies take −4 accuracy and a Perception Bane. Actions are limited to movement or ending invisibility. Threats to concentration require Focus or 1 SP."],
    ["Living Weapon",177,"Possess the Trainer’s weapon as an Extended action. While equipped, the Pokémon leaves the party and its damaging weapon attacks become Ghost type."],
    ["Mountable",177,"An adjacent creature can mount or dismount a willing active Pokémon as a Swift action. Both share space and move together using the mount’s movement capabilities."],
    ["Naturewalk",178,"Ignore Slowed and rough terrain penalties in the listed environments."],
    ["Reach",178,"Extend melee attacks and maneuvers to 2m for Small or Medium users and 3m for Large or bigger users. Attack of Opportunity is excluded."],
    ["Shadow Meld",178,"Merge into a shadow as a Standard or Extended action, becoming untargetable with limited actions. Emerge adjacent as a Movement action. Outside combat, the first 10 minutes are free and each additional hour costs 1 SP."],
    ["Telekinetic",178,"Lift objects within 10m with Focus and spend 1 SP for +2 Power for an hour. Disarm, Hinder, Push, and Trip can use Focus at 6m."],
    ["Threaded",178,"Create thread or vine appendages. Most Tactic maneuvers can target from 5m, with Push pulling toward you."],
    ["Truant",178,"Standard-action damaging attacks take a Full action."],
    ["Underdog",178,"Identifies Pokémon with a base stat total of 45 or less, with exceptions."],
    ["Wallshaper",178,"Concentrate to create blocking walls within 5m, using a Standard or Extended action. Walls ignore physical damage but cannot support Weight Class 4 or higher."],
    ["Wielder",178,"Equip a weapon of the listed type and gain its attacks and keywords. Spend a Swift action to use a damaging attack as a weapon attack at the weapon’s range."]
  ]},
  {name:"Narrative",entries:[
    ["Alluring",178,"Emit a pleasant scent."],
    ["Amorphous",178,"Reshape your body to squeeze through tight spaces."],
    ["Aura Reader",178,"Read a living creature’s aura for clues about personality, mood, and intent."],
    ["Breathless",179,"You do not need to breathe and cannot suffocate."],
    ["Chilled",179,"Emit cold that helps creatures in range ignore Harsh Heat."],
    ["Dream Reader",179,"View adjacent sleepers’ dreams. Spend 1 SP to shape a touched sleeper’s dream or project it."],
    ["Dead Silent",179,"Move silently while concentrating."],
    ["Empath",179,"Sense surface emotions within 10m. Spend 1 SP and roll Focus to read deeper emotions within 5m."],
    ["Engine",179,"Merge with a motor or vehicle. Varoom and Revavroom may gain compatible traits or attacks."],
    ["Gilled",179,"Avoid suffocation damage underwater."],
    ["Glow",179,"Emit light and offset Low Lighting within a radius based on your size."],
    ["Heater",179,"Emit warmth that offsets Harsh Cold within a radius based on your size."],
    ["Illusionist",179,"Create small visual illusions as a Swift or Extended action. Spend 3 SP minus Tier Level and concentrate to lift one restriction."],
    ["Magnetic",179,"Attract or repel iron and steel, detect disturbances within 50m, and communicate with other Magnetic users."],
    ["Mender",179,"Produce a medicinal substance that works like a First Aid Kit."],
    ["Mindlock",179,"Gain a Boon on opposed Focus checks and detect attempts to affect your mind or spirit. Winning the opposition reveals clues and blocks further attempts by that user this scene."],
    ["Mind Weaver",179,"Touch a creature’s head to read or erase memories through opposed Focus unless willing. Additional effort can reach older memories."],
    ["Pack Mon",180,"Trainers gain a Command Boon with Pokémon. Social checks against a Pokémon with this capability gain a Boon if it has no leader or a Bane if it respects its leader."],
    ["Premonition",180,"Sense an impending disaster with clarity depending on proximity and method. Spend SP for more detail."],
    ["Repulsive",180,"Emit an unpleasant scent."],
    ["Shapeshifter",180,"Change shape as a Standard or Extended action within 50% of your mass. Copies do not gain the original’s traits or complex functions."],
    ["Soul Seer",180,"Observe souls for clues about injury and disposition. Close range and sustained attention reveal more detail."],
    ["Telepath",180,"Project and read thoughts within 10m through opposed Focus if unwilling. Spending SP and making a Focus check can reveal deeper thoughts."],
    ["Thermal Vision",180,"Focus for at least one minute to see in infrared."],
    ["Tremorsense",180,"Detect objects in or on the ground within 10m. Unusual surfaces may require a CR 2 Focus or Intuition check."],
    ["Tracker",180,"Follow a known scent on a CR 2 Perception check or recall past scents on a CR 4 check."],
    ["True Sight",180,"See through illusions and invisibility."],
    ["Wired",180,"Travel instantly between devices linked by cables. Rotom may possess a device and gain an attack."],
    ["X-Ray Vision",180,"Focus for one minute to see blurry shapes beyond blocking terrain within 2m."]
  ]}
].map(group=>({...group,entries:group.entries.map(([name,page,summary])=>({name,page,summary}))}));

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
