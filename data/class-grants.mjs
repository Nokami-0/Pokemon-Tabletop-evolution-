const attack = name => ({kind:"move",name});
const feature = name => ({kind:"feature",name});
const gear = name => ({kind:"gear",name});
const capability = name => ({kind:"capability",name});
const choices = (id,label,count,options,minFeatures = 0) => ({id,label,count,options,minFeatures});
const attacks = (id,label,n,names,minFeatures) => choices(id,label,n,names.map(name=>[attack(name)]),minFeatures);
const fixed = (...rewards) => ({id:"fixed",label:"Grant benefits",count:0,options:[rewards]});
const paired = [
  ["Dream Reader","Dream Illusion"],["Empath","Psycho Shift"],["Mender","Heal Pulse"],
  ["Mindlock","Calm Mind"],["Mind Weaver","Disable"],["Premonition","Mind Reader"],
  ["Telepath","Imprison"],["Telekinetic","Telekinesis"],["Teleporter","Teleport"],["Wallshaper","Barrier"]
].map(([name,move])=>[capability(name),attack(move)]);

const elementalAttackTiers = {
  "Bug Elementalist": [
    [
      "Bug Bite",
      "Defend Order",
      "Fell Stinger",
      "Fury Cutter",
      "Insect Cleave",
      "Pheromone Spray",
      "Skitter Dance",
      "Skitter Smack",
      "Silver Wind",
      "Sticky Web",
      "String Shot",
      "U-Turn",
      "Web Shot"
    ],
    [
      "Attack Order",
      "Bug Buzz",
      "Infestation",
      "Leech Life",
      "Locust Swarm",
      "Lunge",
      "Pheromone Haze",
      "Powder",
      "Quiver Dance",
      "Rage Powder",
      "Silk Weave",
      "Signal Beam",
      "X-Scissor"
    ],
    [
      "Giga Leech",
      "Heal Order",
      "Lance Stinger",
      "Megahorn",
      "Powder Storm",
      "Silver Cyclone",
      "Spider Web",
      "Silk Trap"
    ]
  ],
  "Dark Elementalist": [
    [
      "Assurance",
      "Backlash",
      "Bite",
      "Blindside",
      "Brutal Swing",
      "Fake Tears",
      "Feint Attack",
      "Flatter",
      "Hone Claws",
      "Nasty Plot",
      "Night Slash",
      "Payback",
      "Pursuit",
      "Shadow Strike",
      "Snarl",
      "Sucker Punch",
      "Switcheroo",
      "Taunt",
      "Thief"
    ],
    [
      "Beat Up",
      "Cackle",
      "Crunch",
      "Dark Pulse",
      "Gash",
      "Knock Off",
      "Lash Out",
      "New Moon",
      "Power Trip",
      "Punishment",
      "Ripping Abyss",
      "Savage Roar",
      "Shadow Snare",
      "Shadow Veil",
      "Siphon Life",
      "Throat Chop",
      "Torment"
    ],
    [
      "Chaos Strike",
      "Foul Play",
      "Lunar Beam",
      "Scornful Vortex",
      "Shadow Bolt"
    ]
  ],
  "Dragon Elementalist": [
    [
      "Breaking Swipe",
      "Breath Blast",
      "Draconic Roar",
      "Dragon Dance",
      "Dragon Spirit",
      "Dragon Rage",
      "Dragon Tail",
      "Dual Chop",
      "Scale Shot",
      "Twister"
    ],
    [
      "Ancestral Fury",
      "Draconic Aura",
      "Dragon Claw",
      "Dragon Force",
      "Dragon Hammer",
      "Dragon Pulse",
      "Imposing Stare",
      "Mystic Aura",
      "Primal Storm",
      "Primal Energy",
      "Rending Swipe",
      "Scorching Breath"
    ],
    [
      "Draco Meteor",
      "Dragon Axe",
      "Dragon Rush",
      "Outrage",
      "Scale Shield",
      "Scorched Earth"
    ]
  ],
  "Electric Elementalist": [
    [
      "Charge",
      "Charge Beam",
      "Eerie Impulse",
      "Electroweb",
      "Shock Wave",
      "Spark",
      "THunder Fang",
      "Thunder Spear",
      "Thunder Wave",
      "Volt Switch"
    ],
    [
      "Charged Velocity",
      "Discharge",
      "Electric Terrain",
      "Electrify",
      "Electro Ball",
      "Electro Burst",
      "Ion Capture",
      "Ion Deluge",
      "Magnetic Flux",
      "Plasma Storm",
      "Rising Voltage",
      "Thunder Punch",
      "Thunderbolt",
      "Thunderstorm",
      "Volt Crush",
      "Wild Charge"
    ],
    [
      "Electro Shot",
      "Energy Bomb",
      "Gigavolt",
      "Lightning Lance",
      "Magnet Rise",
      "Plasma Fists",
      "Plasma Tail",
      "Thunder",
      "Volt Tackle",
      "Zap Cannon"
    ]
  ],
  "Fairy Elementalist": [
    [
      "Aromatic Mist",
      "Baby-Doll Eyes",
      "Charm",
      "Cosmic Curse",
      "Disarming Voice",
      "Draining Kiss",
      "Enchanting Aria",
      "Fae Blessing",
      "Glitter Darts",
      "Love Bite",
      "Star Slash",
      "Star Strike"
    ],
    [
      "Alluring Voice",
      "Dazzling Gleam",
      "Fey Storm",
      "Floral Healing",
      "Misty Eruption",
      "Misty Guard",
      "Misty Terrain",
      "Moonlight",
      "Moral Support",
      "Play Rough",
      "Sweet Kiss",
      "Spellbind",
      "Spirit Break",
      "Stardust",
      "Strange Steam",
      "Sweet Splash"
    ],
    [
      "Flower Shield",
      "Glitter Bomb",
      "Healing Wish",
      "Light of Ruin",
      "Magical Bomb",
      "Moonblast",
      "Mystic Circle",
      "Sparkling Slam",
      "Starfall",
      "Starlight Spark",
      "Wish"
    ]
  ],
  "Fighting Elementalist": [
    [
      "Arm Thrust",
      "Aura Blast",
      "Bulk Up",
      "Circle Throw",
      "Coaching",
      "Concentration",
      "Double Kick",
      "Force Palm",
      "Karate Chop",
      "Lotus Palm",
      "Low Kick",
      "Low Sweep",
      "Mach Punch",
      "Power-Up Punch",
      "Reversal",
      "Rolling Kick",
      "Vital Throw"
    ],
    [
      "Adrenaline Boost",
      "Aura Sphere",
      "Aura Tempest",
      "Body Press",
      "Brick Break",
      "Counter",
      "Detect",
      "Drain Punch",
      "Intense Aura",
      "Pressure Point",
      "Sacred Sword",
      "Seismic Toss",
      "Sky Uppercut",
      "Submission"
    ],
    [
      "Aura Burst",
      "Close Combat",
      "Cross Chop",
      "Dynamic Punch",
      "Focus Blast",
      "Focus Punch",
      "Hammer Arm",
      "High Jump Kick",
      "Mat Block",
      "Quick Guard",
      "Superpower"
    ]
  ],
  "Fire Elementalist": [
    [
      "Fire Spin",
      "Fire Wall",
      "Flame Burst",
      "Flame Charge",
      "Flame Wheel",
      "Heat Veil",
      "Incinerate",
      "Kindle",
      "Sunny Day",
      "Twin Flames",
      "Wildfire",
      "Will-o-Wisp"
    ],
    [
      "Blaze Kick",
      "Blazing Sun",
      "Burning Jealousy",
      "Fire Lash",
      "Fire Punch",
      "Fire Pledge",
      "Flame Rush",
      "Flamethrower",
      "Ignition",
      "Lava Plume",
      "Raging Fire",
      "Temper Flare"
    ],
    [
      "Blast Burn",
      "Eruption",
      "Fire Blast",
      "Firestorm",
      "Flare Blitz",
      "Heat Wave",
      "Lava Armor",
      "Overheat"
    ]
  ],
  "Flying Elementalist": [
    [
      "Acrobatics",
      "Aerial Ace",
      "Air Cutter",
      "Concussive Burst",
      "Dual Wingbeat",
      "Feather Dance",
      "Gale Force",
      "Pluck",
      "Quick Strike",
      "Wind Blades",
      "Wing Attack"
    ],
    [
      "Air Slash",
      "Bounce",
      "Cyclone",
      "Defog",
      "Drill Peck",
      "Heavy Winds",
      "Mach Speed",
      "Razor Wind",
      "Roost",
      "Wind Storm",
      "Wind Wall",
      "Whirlwind"
    ],
    [
      "Aerial Combat",
      "Brave Bird",
      "Feather Storm",
      "Hurricane",
      "Molt Feathers",
      "Sky Attack",
      "Sky Bomb",
      "Tailwind",
      "Tempest",
      "Wind Shift"
    ]
  ],
  "Ghost Elementalist": [
    [
      "Astonish",
      "Confuse Ray",
      "Devious Strike",
      "Ghastly Scream",
      "Malice",
      "Ominous Wind",
      "Phantom Fright",
      "Shadow Claw",
      "Shadow Punch",
      "Shadow Sneak",
      "Soul Drain",
      "Spiteful Fury"
    ],
    [
      "Curse",
      "Dark Fog",
      "Haunting Aura",
      "Hex",
      "Nightmare",
      "Poltergeist",
      "Shadow Ball",
      "Shadow Realm",
      "Spite",
      "Terrify",
      "Tormenting Spirits",
      "Vengeance"
    ],
    [
      "Deathly Wail",
      "Deception",
      "Destiny Bond",
      "Grudge",
      "Haunting Visage",
      "Phantom Force",
      "Phantom Fury",
      "Spectral Storm",
      "Wrathful Blitz"
    ]
  ],
  "Grass Elementalist": [
    [
      "Bullet Seed",
      "Cotton Spore",
      "Grass Knot",
      "Grassy Glide",
      "Leaf Tornado",
      "Magical Leaf",
      "Mega Drain",
      "Needle Arm",
      "Razor Leaf",
      "Syrup Bomb"
    ],
    [
      "Aromatherapy",
      "Burn Powder",
      "Cotton Cloak",
      "Cotton Shower",
      "Energy Ball",
      "Floral Burst",
      "Forest’s Curse",
      "Giga Drain",
      "Grass Pledge",
      "Grass Whistle",
      "Grassy Terrain",
      "Ingrain",
      "Leaf Blade",
      "Leech Seed",
      "Mystic Powder",
      "Petal Blizzard",
      "Pollen Storm",
      "Seed Bomb",
      "Sleep Powder",
      "Stun Spore",
      "Synthesis",
      "Wild Growth",
      "Worry Seed"
    ],
    [
      "Chloroblast",
      "Cotton Guard",
      "Frenzy Plant",
      "Ivy Leech",
      "Leaf Storm",
      "Petal Dance",
      "Power Whip",
      "Solar Beam",
      "Solar Blade",
      "Spiky Shield",
      "Spore",
      "Wood Hammer",
      "Vine Shield"
    ]
  ],
  "Ground Elementalist": [
    [
      "Bulldoze",
      "Dust Cloud",
      "Earth Shard",
      "Mud Bomb",
      "Mud Shot",
      "Mud Sport",
      "Sand Attack",
      "Sand Pit",
      "Sinkhole",
      "Spikes"
    ],
    [
      "Aftershock",
      "Drill Run",
      "Dual Quake",
      "Dust Storm",
      "Dusty Day",
      "Earth Power",
      "Landslide",
      "Magnitude",
      "Quicksand",
      "Rototiller",
      "Sand Cannon",
      "Sand Tomb",
      "Sandy Terrain",
      "Scorching Sands",
      "Shore Up",
      "Stomping Tantrum"
    ],
    [
      "Earthquake",
      "Headlong Rush",
      "Shifting Soil",
      "Tectonic Burst",
      "Terraform"
    ]
  ],
  "Ice Elementalist": [
    [
      "Aurora Beam",
      "Freeze-Dry",
      "Frost Breath",
      "Ice Fang",
      "Ice Shard",
      "Ice Spinner",
      "Icicle Spear",
      "Icy Wind",
      "Thermodrain"
    ],
    [
      "Avalanche",
      "Cleansing Aurora",
      "Crystal Slash",
      "Frostbite",
      "Frost Blast",
      "Frozen Claw",
      "Frozen Dash",
      "Frozen Terrain",
      "Hail",
      "Haze",
      "Ice Beam",
      "Ice Punch",
      "Icicle Crash",
      "Mist",
      "Snowstorm"
    ],
    [
      "Arctic Quake",
      "Aurora Veil",
      "Blizzard",
      "Frost Typhoon",
      "Ice Hammer",
      "Icicle Storm"
    ]
  ],
  "Normal Elementalist": [
    [
      "Block",
      "Camouflage",
      "Chip Away",
      "Comet Punch",
      "Conversion",
      "Copycat",
      "Crush Claw",
      "Cut",
      "Echoed Voice",
      "Flash",
      "Focus Energy",
      "Headbutt",
      "Helping Hand",
      "Luster Shock",
      "Metronome",
      "Round",
      "Shining Shroud",
      "Starbeam",
      "Stomp",
      "Sunburst",
      "Sunspot",
      "Swift",
      "Swords Dance",
      "Work Up"
    ],
    [
      "Blinding Radiance",
      "Body Slam",
      "Burning Light",
      "Extreme Speed",
      "Facade",
      "Flashbang",
      "Hold Hands",
      "Hyper Voice",
      "Laser Focus",
      "Lucky Chant",
      "Mega Punch",
      "Morning Sun",
      "Prismatic Shot",
      "Radiant Beam",
      "Recover",
      "Refresh",
      "Retaliate",
      "Safeguard",
      "Sing",
      "Slack Off",
      "Slam",
      "Slash",
      "Solar Flare",
      "Solstice Dance",
      "Sonic Boom",
      "Strength",
      "Take Down",
      "Terrain Pulse",
      "Tri Attack",
      "Uproar",
      "Weather Ball",
      "Yawn"
    ],
    [
      "Boomburst",
      "Double-Edge",
      "Endure",
      "Feint",
      "Final Flash",
      "Head Charge",
      "Heal Bell",
      "Hyper Beam",
      "Last Resort",
      "Mega Kick",
      "Mimic",
      "Protect",
      "Skull Bash",
      "Supernova",
      "Thrash"
    ]
  ],
  "Poison Elementalist": [
    [
      "Acid",
      "Acid Breath",
      "Acid Spray",
      "Cross Poison",
      "Noxious Gas",
      "Poison Dart",
      "Poison Fang",
      "Poison Gas",
      "Poison Tail",
      "Sludge",
      "Smog",
      "Toxic Spikes",
      "Venom Drench"
    ],
    [
      "Acid Rain",
      "Assassinate",
      "Blighted Touch",
      "Clear Smog",
      "Corrosive Gas",
      "Numbing Venom",
      "Plague Breath",
      "Poison Jab",
      "Poison Powder",
      "Sludge Bomb",
      "Smog Cloud",
      "Sulfur Plume",
      "Toxic Mist",
      "Toxic Threads",
      "Toxin Rain",
      "Venom Claw",
      "Venoshock"
    ],
    [
      "Acid Armor",
      "Acidic Impact",
      "Baneful Bunker",
      "Belch",
      "Gastro Acid",
      "Gunk Shot",
      "Purify",
      "Sludge Wave",
      "Toxic",
      "Toxin Drain"
    ]
  ],
  "Psychic Elementalist": [
    [
      "Amnesia",
      "Calm Mind",
      "Cognition Strike",
      "Cosmic Power",
      "Force Dash",
      "Psionic Boost",
      "Psybeam",
      "Psychic Noise",
      "Psycho Cut"
    ],
    [
      "Barrier",
      "Eerie Spell",
      "Expanding Force",
      "Extrasensory",
      "Force Punch",
      "Gravity",
      "Heal Pulse",
      "Hypnosis",
      "Imprison",
      "Kinesis",
      "Light Screen",
      "Magic Coat",
      "Magic Powder",
      "Meditate",
      "Mind Crush",
      "Psionic Surge",
      "Psychic",
      "Psychic Fangs",
      "Psychic Storm",
      "Psychic Terrain",
      "Psyshock",
      "Reflect",
      "Stored Power",
      "Telekinesis",
      "Trick Room",
      "Wonder Room",
      "Zen Headbutt"
    ],
    [
      "Dream Eater",
      "Dream Illusion",
      "Future Sight",
      "Magic Room",
      "Migraine",
      "Mind Flay",
      "Mirror Coat",
      "Mystical Overload",
      "Psycho Boost",
      "Psycho Shift",
      "Psycho Slash",
      "Teleport",
      "Trick"
    ]
  ],
  "Rock Elementalist": [
    [
      "Accelerock",
      "Ancient Power",
      "Crystal Daggers",
      "Crystal Rupture",
      "Crystalize",
      "Rock Polish",
      "Rock Tomb",
      "Rollout",
      "Smack Down",
      "Terra Burst",
      "Terra Charge"
    ],
    [
      "Ancient Strike",
      "Diamond Dust",
      "Fossilize",
      "Geode Beam",
      "Gleaming Ore",
      "Power Gem",
      "Rock Blast",
      "Rock Slide",
      "Sandstorm",
      "Stealth Rock",
      "Stone Pillar",
      "Subterranean Strike",
      "Tar Shot"
    ],
    [
      "Cave Collapse",
      "Crystal Cyclone",
      "Crystal Prison",
      "Head Smash",
      "Meteor Beam",
      "Meteor Shower",
      "Rock Wrecker",
      "Stone Edge",
      "Tar Blast",
      "Wide Guard"
    ]
  ],
  "Steel Elementalist": [
    [
      "Bullet Punch",
      "Gear Grind",
      "Inertial Throw",
      "Iron Defense",
      "Iron Spikes",
      "Magnet Bomb",
      "Magnetic Pulse",
      "Metal Claw",
      "Metal Sound",
      "Metal Swipe",
      "Mirror Shot",
      "Shrapnel Shot",
      "Smart Strike"
    ],
    [
      "Autotomize",
      "Execution",
      "Flash Cannon",
      "Gear Up",
      "Gyro Ball",
      "Heavy Slam",
      "Iron Blade",
      "Iron Coating",
      "Iron Head",
      "Magnetic Grip",
      "Magnetic Storm",
      "Magnetic Surge",
      "Metallurgy",
      "Meteor Mash",
      "Overclock",
      "Plasma Beam",
      "Scrap Shield",
      "Steel Wing"
    ],
    [
      "Ferrous Flash",
      "Iron Tail",
      "Kinetic Strike",
      "King’s Shield",
      "Metal Burst",
      "Shift Gear",
      "Steel Beam",
      "Steel Roller"
    ]
  ],
  "Water Elementalist": [
    [
      "Aqua Cutter",
      "Aqua Jet",
      "Bubblebeam",
      "Chilling Water",
      "Fin Swipe",
      "Flip Turn",
      "Slipstream",
      "Spiral Drain",
      "Steam Cloud",
      "Water Gun",
      "Water Pulse",
      "Water Sport",
      "Withdraw"
    ],
    [
      "Aqua Fist",
      "Aqua Infusion",
      "Aqua Ring",
      "Aqua Tail",
      "Brine",
      "Life Dew",
      "Liquidation",
      "Muddy Water",
      "Rain Dance",
      "Razor Shell",
      "Scald",
      "Soak",
      "Steam Blast",
      "Surf",
      "Torpedo Smash",
      "Torrential Typhoon",
      "Water Pledge",
      "Water Shuriken",
      "Waterfall",
      "Wave Crash",
      "Whirlpool"
    ],
    [
      "Crabhammer",
      "Geyser Surge",
      "Hydro Cannon",
      "Hydro Cleanse",
      "Hydro Pump",
      "Riptide"
    ]
  ]
};

const reviewedGrants = new Map(Object.entries({
  Esper:[
    attacks("starting","Choose starting attacks",2,["Cognition Strike","Hypnosis","Psybeam","Psychic Terrain"]),
    attacks("advanced","Choose advanced attacks",2,["Psycho Cut","Psychic","Psychic Storm","Psionic Surge"],4)
  ],
  "Psionic Prowess":[choices("capability","Choose a capability and attack",1,paired)],
  "Metaphysical Mastery":[
    attacks("mastery","Choose mastery attacks",2,["Psycho Boost","Psycho Slash","Psionic Boost","Mirror Coat"]),
    choices("capability","Choose another capability and attack",1,paired)
  ],
  "Aura Guardian":[
    attacks("starting","Choose starting attacks",2,["Aura Blast","Detect","Force Bullet","Vacuum Wave"]),
    attacks("advanced","Choose advanced attacks",2,["Aura Burst","Aura Sphere","Focus Blast","Heal Pulse"],4)
  ],
  "Mind Mage":[
    choices("path","Choose a path",1,[
      [capability("Emotion Stoker"),attack("Torment")],
      [capability("Mind Weaver"),attack("Disable")],
      [capability("Aura Reader"),attack("Focus Energy")]
    ]),
    choices("advanced","Choose an advanced capability",1,["Empath","Mindlock","Telepath","Telekinetic"].map(name=>[capability(name)]),4)
  ],
  Debonair:[fixed(feature("Cute Charm"))],
  Hunter:[fixed(feature("Pack Hunt"),feature("Battle Commander"))],
  Herbalist:[fixed(gear("Seed Bag"))],
  Imposter:[fixed(feature("Makeshift Artisan"),attack("Copycat"))],
  Motivator:[fixed(feature("Battle Commander"))],
  Ranger:[fixed(gear("Ranger Styler"))],
  "Burst Warrior":[fixed(capability("Burst Form"))],
  "Chaos Mage":[fixed(feature("Chaotic"),attack("Metronome"))],
  "Death Bringer":[fixed(feature("Soulstealer"))],
  Dreamwalker:[fixed(attack("Hypnosis"))],
  Lifeweaver:[fixed(capability("Mender"),attack("Heal Pulse"))],
  Warper:[fixed(capability("Teleporter"),attack("Teleport"))]
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
