import {registerTwoSideCombatTracker} from "./two-side-combat-tracker.mjs";
import {weaponPresets} from "../data/weapon-presets.mjs";
import {itemKeywords, equipmentEligible, itemSlotLabel, slotTotals} from "../data/item-slots.mjs";
import {equipment} from "../data/equipment.mjs";
import {rangeShapes,placeRangeTemplate,removeLastRangeTemplate,inspectRangeTemplates,removeRangeOnMap} from "./range-templates.mjs";
import {installJournalLibrary, openJournalLibrary} from "./journal-library.mjs";
import {classReferences} from "../data/class-references.mjs";
import {advancementGrants} from "../data/class-grants.mjs";
import {speciesArtworkFiles} from "../data/token-art.mjs";
import {weaponQualities, weaponKeywords, weaponTiers, eligibleWeaponAttack, weaponAttackStats} from "./weapons.mjs";
import {maneuvers, riposteDamageResult} from "./maneuvers.mjs";
import {entrySource, catalogItemData, catalogEffect, classEffect, linkedEffectPlaceholder, categoryEffectPlaceholder} from "../data/item-data.mjs";
import {capabilityGroups, capabilityUses, capabilitySpiritCost} from "../data/capabilities.mjs";
import {normalizeRequirement, requirementResult, speciesRequirement, normalizeAbilityName, speciesAbilityNames, evolutionOptions, normalizeMoveName} from "./prerequisites.mjs";
import {catalog as bookCatalog} from "../data/catalog.mjs";
import {attackCatalog} from "../data/attacks.mjs";
const catalog = [...bookCatalog,...attackCatalog];
const attackReference = "https://docs.google.com/spreadsheets/d/1t6aEWjhpgM7m93lNExN4cNAFnuPEr53n_vbtsPZM99k/edit";
import {TrainerData, PokemonData, MoveData, GearData, FeatureData} from "./models.mjs";
import {stats, skills, ranks, types, effectiveness, matchupLabel, tier, maxHP, evasion, successes, damageFormula, stagedStat, afflictions, conditions, grantedCondition, afflictionImmunities, afflictionTickDamage, recoveryGear, recoveryPlan, boostGear, boostPlan, potionVariants, capCombatModifier, maladyGear, maladyPlan, moveActionCost, moveUsePlan, combatDamageUpdate, restPlan, basicAttackProfiles, basicAttackData, opposedResult, pokemonTokenFootprint, initiativeSpeedModifier, trainerMeritGoal, trainerLevelPlan, pokemonTutorTiers, pokemonSkillTrainingDice, pokemonStatReward, pokemonEvolutionStats, pokemonLevelCap, pokemonLevelPlan, allocateLevelPoints, walletBalance, maxSpiritPoints, spiritBalance} from "./rules.mjs";

const ID = "pokemon-tabletop-evolution";
const root = `systems/${ID}`;
const {HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;
const {ActorSheetV2, ItemSheetV2} = foundry.applications.sheets;
const {Actor, ChatMessage, Item} = foundry.documents;
const {Roll} = foundry.dice;
const {Hooks} = foundry.helpers;
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const choices = (options, selected) => options.map(value => ({value, selected:value === selected}));
const actions = ["standard","swift","movement","reaction"];
const titleCase = str => str[0].toUpperCase() + str.slice(1);
const afflicted = (actor,key) => Boolean(actor.system.afflictions?.[key]);
const equipmentProfile = item => item?.type === "gear" && Object.hasOwn(equipment,item.name) ? equipment[item.name] : null;
const equippedGear = actor => actor.items.filter(item=>item.type === "gear" && item.system.equipped &&
  item.system.quantity > 0 && !item.system.inStorage && !item.system.impaired && equipmentEligible(item,actor.type === "pokemon") && actor.system.level >= (equipmentProfile(item)?.level || 0));
const gearBonus = (actor,key) => equippedGear(actor).reduce((total,item)=>total + (equipmentProfile(item)?.[key] || 0),0);
const gearStage = (actor,key) => equippedGear(actor).some(item=>equipmentProfile(item)?.stage === key) ?
  1 - (actor.system.defaultStages?.[key] ?? 0) : 0;
const effectiveStage = (actor,key) => capCombatModifier((actor.system.stages?.[key] ?? 0) +
  (actor.system.potionStages?.[key] ?? 0) + gearStage(actor,key));

const equippedShield = actor => equippedGear(actor).find(item=>equipmentProfile(item)?.shield);
function adjacentTokens(a,b) {
  if (!a?.bounds || !b?.bounds || a === b) return false;
  const x = Math.max(a.bounds.left - b.bounds.right,b.bounds.left - a.bounds.right,0);
  const y = Math.max(a.bounds.top - b.bounds.bottom,b.bounds.top - a.bounds.bottom,0);
  return x <= 1 && y <= 1;
}

function effectiveReduction(actor) {
  const shields = actor.getFlag(ID,"shieldProtection") || [];
  const protection = shields.reduce((total,row)=>{
    const scene = globalThis.canvas?.scene;
    if (row.sceneId !== (scene?.id ?? null)) return total;
    const tokens = globalThis.canvas?.tokens;
    const sourceToken = tokens?.get(row.sourceToken);
    const targetToken = tokens?.get(row.targetToken);
    const source = row.self ? actor : sourceToken?.actor;
    if (!source || source.uuid !== row.source || !equippedShield(source) ||
      source.system.attackScene !== row.scene || source.system.attackTurn !== row.turn ||
      (row.self && !equippedGear(source).some(item=>item.name === "Heavy Shield"))) return total;
    if (row.combatId) {
      const combat = game.combats.get(row.combatId);
      if (!combat?.started || combat.round > row.expiresRound ||
        (combat.round === row.expiresRound && combat.turn >= row.expiresTurn)) return total;
    }
    if (!row.self && (targetToken?.actor?.uuid !== actor.uuid || !adjacentTokens(sourceToken,targetToken))) return total;
    return Math.max(total,row.reduction);
  },0);
  return actor.system.reduction + gearBonus(actor,"reduction") + protection;
}

async function protectWithShield(source,target,sourceToken,targetToken) {
  const previous = target.getFlag(ID,"shieldProtection") || [];
  const self = source === target;
  const reduction = [5,10,20][tier(source.system.level,pokemon(source)) - 1];
  const entry = {source:source.uuid,scene:source.system.attackScene,turn:source.system.attackTurn,
    sceneId:globalThis.canvas?.scene?.id ?? null,sourceToken:sourceToken?.id,
    targetToken:targetToken?.id,self,reduction};
  const combat = game.combat;
  const index = combat?.started ? combat.turns.findIndex(combatant=>sourceToken ?
    combatant.tokenId === sourceToken.id : combatant.actor?.uuid === source.uuid) : -1;
  if (index >= 0) Object.assign(entry,{combatId:combat.id,expiresTurn:index,
    expiresRound:combat.round + Number(index <= combat.turn)});
  await target.setFlag(ID,"shieldProtection",[...previous.filter(row=>row.source !== source.uuid),entry]);
  return reduction;
}

function clearSceneConsumables(system) {
  return Object.fromEntries([
    ...["potionStages","potionBonuses"].flatMap(bucket=>Object.keys(system[bucket]).map(key=>[`system.${bucket}.${key}`,0])),
    ["system.healingPotionUsed",false],
    [`flags.${ID}.-=shieldProtection`,null]
  ]);
}

function combatStat(actor,key) {
  const stage = effectiveStage(actor,key);
  const penalty = (key === "def" && afflicted(actor,"burned")) || (key === "spd" && afflicted(actor,"poisoned"));
  return stagedStat(actor.system.stats[key],stage - (penalty ? 2 : 0));
}
const hasCondition = (actor,key) => actor.system.health.value > 0 &&
  (Boolean(actor.system.conditions[key]) || grantedCondition(actor.system,key));
const potionBonus = (actor,key) => actor.system.potionBonuses?.[key] ?? 0;
const accuracyModifier = actor => capCombatModifier(actor.system.accuracy + gearBonus(actor,"accuracy") +
  potionBonus(actor,"accuracy") - (afflicted(actor,"cursed") ? 3 : 0)) -
  (hasCondition(actor,"blinded") || hasCondition(actor,"tripped") ? 6 : 0);
function attackEvasion(actor, defense) {
  if (hasCondition(actor,"vulnerable")) return 0;
  return capCombatModifier(Math.max(evasion(defense),afflicted(actor,"slowed") ? 0 : evasion(combatStat(actor,"spe"))) +
    actor.system.evasion + potionBonus(actor,"evasion") - (afflicted(actor,"cursed") ? 3 : 0));
}
const pokemon = actor => actor.type === "pokemon";
function linkedTrainer(actor) {
  if (!pokemon(actor)) return null;
  const trainer = game.actors.get(actor.system.trainerId);
  return trainer?.type === "trainer" ? trainer : null;
}
function actionPool(actor,pool) {
  const trainer = linkedTrainer(actor);
  return {owner:trainer || actor,key:trainer || pool === "team" ? "partnerActions" : "actions"};
}
async function resetPartyActions(members) {
  const pools = new Map();
  for (const {actor} of members) {
    if (!actor || !["trainer", "pokemon"].includes(actor.type)) continue;
    const {owner, key} = actionPool(actor);
    const entry = pools.get(owner.uuid) ?? {owner, keys: new Set()};
    entry.keys.add(key);
    pools.set(owner.uuid, entry);
  }
  for (const {owner, keys} of pools.values()) {
    await owner.update(Object.fromEntries(Array.from(keys).flatMap(key =>
      actions.map(action => [`system.${key}.${action}`, false])
    )));
  }
}

const elements = actor => pokemon(actor) ? [...new Set([actor.system.type1,actor.system.type2].filter(Boolean))] : [];
const dex = () => fetch(foundry.utils.getRoute(`${root}/data/dex.json`)).then(response => {
  if (!response.ok) throw new Error("Could not load the Pokédex.");
  return response.json();
});

const books = {
  rulebook:"PTE Rule Book",
  gm:"PTE GM Guide",
  cheat:"PTE Cheat Sheet",
  dex:"PTE Pokédex",
  elementalism:"Path of Elementalism",
  occultism:"Path of Occultism"
};

function bookLink(key, page = 1) {
  const path = game.settings.get(ID, `pdf-${key}`).trim();
  if (!path) return "";
  try {
    const source = /^[a-z][a-z\d+.-]*:/i.test(path) ? path : foundry.utils.getRoute(path);
    const url = new URL(source, window.location.href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    url.hash = `page=${page}`;
    return url.href;
  } catch {
    return "";
  }
}

function showBooks() {
  const journal = openJournalLibrary();
  if (journal) return journal;
  const content = Object.entries(books).map(([key,title]) => {
    const url = bookLink(key);
    return url ? `<li><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(title)}</a></li>`
      : `<li>${escape(title)} · PDF path needed</li>`;
  }).join("");
  return DialogV2.prompt({classes:["pte-dialog"],window:{title:"PTE Rule Library"},
    content:`<ul>${content}<li><a href="${attackReference}" target="_blank" rel="noopener noreferrer">Attacks &amp; Ability Reference</a></li></ul><p>GMs can link PDFs in Configure Settings under Pokémon Tabletop Evolution.</p>`,
    ok:{label:"Close"},rejectClose:false});
}

let profiles;
function dexProfiles() {
  profiles ??= (async () => {
    const response = await fetch(foundry.utils.getRoute(`${root}/data/dex-profiles.json.gz`));
    if (!response.ok || !response.body) throw new Error("Could not load Pokédex profiles.");
    const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
    const entries = await new Response(stream).json();
    return new Map(entries.map(entry => [entry.page,entry]));
  })().catch(error => { profiles = undefined; throw error; });
  return profiles;
}

async function availableArtwork(path) {
  try {
    const response = await fetch(foundry.utils.getRoute(path),{method:"HEAD"});
    return response.ok && (response.headers.get("content-type") || "").startsWith("image/") ? path : "";
  } catch {
    return "";
  }
}

async function tokenArtwork(page) {
  const directory = game.settings.get(ID,"token-directory").trim().replace(/\/+$/,"");
  const file = speciesArtworkFiles[page];
  if (!file) return {};
  const bundled = `${root}/assets/pte-tokens`;
  const readPair = folder => Promise.all([
    availableArtwork(`${folder}/Portraits/${file}`),
    availableArtwork(`${folder}/Ringed Tokens/${file}`)
  ]);
  const [customPortrait,customToken] = directory && directory !== bundled ? await readPair(directory) : ["",""];
  const [bundledPortrait,bundledToken] = customPortrait && customToken ? ["",""] : await readPair(bundled);
  const portrait = customPortrait || bundledPortrait;
  const token = customToken || bundledToken;
  const legacy = portrait && token ? "" : await availableArtwork(`${directory || "pte-tokens"}/${page}.png`);
  return {portrait:portrait || legacy || token,token:token || legacy || portrait};
}

function tokenArtworkUpdates(art) {
  return {...(art.portrait ? {img:art.portrait} : {}),
    ...(art.token ? {"prototypeToken.texture.src":art.token} : {})};
}

async function applySpeciesArtwork(actor) {
  if (!actor.isOwner || actor.type !== "pokemon") return;
  const art = await tokenArtwork(actor.system.dexPage);
  if (!art.token) return ui.notifications.warn("Install the portrait and token pack in the configured Foundry Data folder.");
  await actor.update(tokenArtworkUpdates(art));
  await syncSceneTokens(actor,{"texture.src":art.token});
}

async function syncSceneTokens(actor,changes) {
  const scene = globalThis.canvas?.scene;
  const updates = Array.from(scene?.tokens ?? []).filter(token=>token.actor?.uuid === actor.uuid && token.isOwner)
    .map(token=>({_id:token.id,...changes}));
  if (updates.length) await scene.updateEmbeddedDocuments("Token",updates);
}

function prototypeFootprintUpdates(footprint) {
  return footprint ? {"prototypeToken.width":footprint.width,"prototypeToken.height":footprint.height} : {};
}

async function applySpeciesTokenSize(actor) {
  if (!actor.isOwner || !pokemon(actor)) return;
  const entry = (await dexProfiles()).get(actor.system.dexPage);
  const footprint = entry && normalizeRequirement(entry.name) === normalizeRequirement(actor.system.species || "") &&
    pokemonTokenFootprint(entry.profile);
  if (!footprint) return ui.notifications.warn("This Pokédex entry has no listed grid size. Set the token dimensions manually.");
  const scene = globalThis.canvas?.scene;
  const tokens = scene?.tokens ?? [];
  const updates = Array.from(tokens).filter(token=>token.actor?.uuid === actor.uuid && token.isOwner)
    .map(token=>({_id:token.id,...footprint}));
  await actor.update(prototypeFootprintUpdates(footprint));
  if (updates.length) await scene.updateEmbeddedDocuments("Token",updates);
  ui.notifications.info(`Token size set to ${footprint.width} × ${footprint.height}.`);
}

function describeProfile(entry) {
  const fields = [["Evolution",entry.evolution],["Abilities",entry.abilities],
    ["Capabilities",entry.capabilities],["Skill ranks",entry.skillRanks],
    ["Profile",entry.profile],["Starting attacks",entry.starting.join(", ")]];
  const text = fields.filter(([,value])=>value).map(([label,value])=>
    `<p><strong>${label}</strong> · ${escape(value)}</p>`).join("");
  const list = (label,values) => values.length ? `<h3>${label}</h3><ul>${values.map(value=>`<li>${escape(value)}</li>`).join("")}</ul>` : "";
  const url = bookLink("dex",entry.page);
  return `<div class="pte-species-dialog">${text}${list("Level-up attacks",entry.levelUp)}${list("Tutor attacks",entry.tutor)}
    <p>${url ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">Pokédex p. ${entry.page}</a>` : `Pokédex p. ${entry.page}`}</p></div>`;
}

async function showProfile(page) {
  try {
    const entry = (await dexProfiles()).get(page);
    if (!entry) return ui.notifications.warn("Choose a Pokémon from the Pokédex first.");
    return DialogV2.prompt({classes:["pte-dialog"],window:{title:entry.name},content:describeProfile(entry),ok:{label:"Close"},rejectClose:false});
  } catch (error) {
    console.error(error);
    ui.notifications.error("Could not open this Pokédex profile.");
  }
}

class PTEActor extends Actor {
  prepareDerivedData() {
    super.prepareDerivedData();
    const {system} = this;
    system.health.max = maxHP(system.level, system.stats.hp, pokemon(this));
    system.health.value = Math.min(system.health.value, system.health.max);
  }

  async _preCreate(data, options, user) {
    if (await super._preCreate(data, options, user) === false) return false;
    if (data.system?.health?.value == null) {
      const {level = 1, stats: scores = {hp: pokemon(this) ? 5 : 10}} = this.system;
      this.updateSource({"system.health.value":maxHP(level, scores.hp, pokemon(this))});
    }
    if (data.prototypeToken?.bar1?.attribute == null) {
      this.updateSource({"prototypeToken.bar1.attribute":"health"});
    }
  }
}

const skillThreshold = (actor,index,threshold) =>
  actor.type === "trainer" && actor.system.skills[`s${index}`] === 6 &&
  actor.system.virtuosoSkill === `s${index}` ? Math.max(3,threshold - 1) : threshold;

async function changeSpirit(actor,delta,label) {
  if (!actor?.isOwner || pendingGear.has(actor.uuid)) return;
  pendingGear.add(actor.uuid);
  try {
    const current = actor.system.spirit;
    const balance = spiritBalance(current,delta);
    if (balance === null) {
      ui.notifications.warn("This combatant does not have enough Spirit Points.");
      return false;
    }
    if (balance === current) return ui.notifications.info("Spirit Points are already full.");
    await actor.update({"system.spirit":balance});
    if (label) await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),
      content:`<strong>${escape(label)}</strong> · ${Math.abs(balance - current)} SP ${delta < 0 ? "spent" : "gained"} · ${balance} / ${maxSpiritPoints} SP`});
    return true;
  } finally {
    pendingGear.delete(actor.uuid);
  }
}

const capabilityEntries = capabilityGroups.flatMap(group=>group.entries);
const actorCapabilityUses = (actor,name) => capabilityUses(name,tier(actor.system.level,pokemon(actor)),actor.system.afflictions);

async function useCapability(actor,name) {
  if (!actor.isOwner || actor.system.health.value <= 0) return;
  const entry = capabilityEntries.find(capability=>capability.name === name);
  if (!entry) return;
  const options = actorCapabilityUses(actor,name);
  const disabled = Boolean(actor.system.afflictions.disabled);
  const form = await DialogV2.prompt({classes:["pte-dialog"],window:{title:name},
    content:`<p>${escape(entry.summary)}</p><p>${actor.system.spirit} / ${maxSpiritPoints} SP available.</p>
      <label>Use <select name="use">${options.map(({label,cost,quantity},index)=>{
        const price = quantity === "hours" ? "1 SP per additional hour" : quantity === "sp" ? "Choose SP amount" :
          quantity === "additionalDisabled" && disabled ? `${cost} SP + extra Disabled instances` : `${cost} SP`;
        return `<option value="${index}">${escape(label)} · ${price}</option>`;
      }).join("")}</select></label>
      ${options.some(option=>option.quantity === "hours") ? '<label>Additional hours, if staying merged <input name="hours" type="number" min="1" max="6" value="1"></label>' : ""}
      ${options.some(option=>option.quantity === "sp") ? '<label>Spirit Points, if clarifying the vision <input name="sp" type="number" min="1" max="6" value="1"></label>' : ""}
      ${disabled && options.some(option=>option.quantity === "additionalDisabled") ? '<label>Extra Disabled instances beyond the one tracked <input name="additionalDisabled" type="number" min="0" max="2" value="0"></label>' : ""}
      <p>Confirm this actor has the capability and meets its trigger. Resolve action costs, checks and effects at the table.</p>`,
    ok:{label:"Use Capability",callback:(event,button)=>new FormData(button.form)},rejectClose:false});
  if (!form || !actor.isOwner || actor.system.health.value <= 0) return;
  const index = Number(form.get("use"));
  const option = actorCapabilityUses(actor,name)[index];
  if (!option) return;
  if (option.cost !== options[index]?.cost || disabled !== Boolean(actor.system.afflictions.disabled)) {
    return ui.notifications.warn("The SP cost may have changed. Reopen the capability to confirm it.");
  }
  const amounts = Object.fromEntries(["hours","sp","additionalDisabled"].map(key=>[key,Number(form.get(key))]));
  const cost = capabilitySpiritCost(option,amounts,disabled);
  if (cost === null) return ui.notifications.warn("Enter a valid amount for this capability.");
  if (cost && !await changeSpirit(actor,-cost)) return;
  return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:
    `<strong>${escape(name)}</strong> · ${escape(option.label)} · ${cost} SP spent · ${actor.system.spirit} / ${maxSpiritPoints} SP<p>${escape(entry.summary)}</p>`});
}

function actorCapabilityButtons(speciesCapabilities,notes) {
  const text = normalizeRequirement(`${speciesCapabilities || ""} ${notes || ""}`);
  return capabilityEntries.filter(({name})=>{
    const key = normalizeRequirement(name);
    const expression = new RegExp(`(?:^|[^a-z])${key}(?:$|[^a-z])`);
    return expression.test(text);
  });
}

async function adjustSpirit(actor, mode) {
  if (!actor.isOwner) return;
  if (mode === "session") return changeSpirit(actor,tier(actor.system.level,pokemon(actor)),"Session Spirit Points");
  const spending = mode === "spend";
  const amount = await DialogV2.prompt({classes:["pte-dialog"],window:{title:spending ? "Spend Spirit Points" : "Gain Spirit Points"},
    content:`<p>${actor.system.spirit} / ${maxSpiritPoints} SP</p><label>Amount <input name="amount" type="number" min="1" max="${maxSpiritPoints}" value="1" required></label>`,
    ok:{label:spending ? "Spend" : "Gain",callback:(event,button)=>Number(new FormData(button.form).get("amount"))},rejectClose:false});
  if (!Number.isInteger(amount) || amount < 1 || amount > maxSpiritPoints) return;
  return changeSpirit(actor,spending ? -amount : amount,spending ? "Spirit Points" : "Spirit Point Recovery");
}

async function skill(actor, index) {
  const rank = actor.system.skills[`s${index}`];
  const trained = pokemon(actor) ? pokemonSkillTrainingDice(actor.system,`s${index}`) : 0;
  const maxBonusDice = rank > 1 ? rank + trained - 1 : 0;
  const args = await DialogV2.prompt({classes:["pte-dialog"],
    window:{title:skills[index]},
    content:`<label>Challenge Rating <input name="cr" type="number" min="0" value="2"></label>
      <label>Modifier <select name="mode"><option value="4">Normal</option><option value="3">Boon</option><option value="5">Bane</option></select></label>
      <label>Spirit Points <input name="sp" type="number" min="0" max="${Math.max(0,Math.min(actor.isOwner ? actor.system.spirit : 0, maxBonusDice))}" value="0"></label>`,
    ok:{label:"Roll", callback:(event, button) => new FormData(button.form)},
    rejectClose:false
  });
  if (!args) return;
  const sp = Math.max(0,Math.min(actor.isOwner ? actor.system.spirit : 0, maxBonusDice, Math.trunc(Number(args.get("sp")) || 0)));
  const cr = Math.max(0, Math.trunc(Number(args.get("cr")) || 0));
  if (sp && !await changeSpirit(actor,-sp)) return;
  const roll = await new Roll(`${rank + sp + trained}d6`).evaluate();
  const count = successes(roll.dice[0].values, skillThreshold(actor,index,Number(args.get("mode"))));
  await roll.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor:`<strong>${skills[index]}</strong> · ${count} successes · CR ${cr} · ${count >= cr ? "Pass" : "Fail"}${sp ? ` · ${sp} SP spent (${actor.system.spirit} left)` : ""}`});
}

async function multiSkillCheck(actor, opposed) {
  const unique = new Map([[actor.uuid,actor]]);
  for (const token of game.user.targets) if (token.actor) unique.set(token.actor.uuid,token.actor);
  const participants = [...unique.values()];
  if (opposed ? participants.length !== 2 : participants.length < 3) {
    return ui.notifications.warn(opposed ? "Target one other actor for an opposed check." : "Include at least three actors by targeting the other participants.");
  }
  if (participants.some(participant=>!participant.isOwner)) {
    return ui.notifications.warn("The GM or an owner of every participant must roll this check.");
  }
  const fields = participants.map((participant,index)=>`<fieldset><legend>${escape(participant.name)}</legend>
    <label>Skill <select name="skill${index}">${skills.map((skill,id)=>`<option value="${id}">${escape(skill)}</option>`).join("")}</select></label>
    <label>Modifier <select name="mode${index}"><option value="4">Normal</option><option value="3">Boon</option><option value="5">Bane</option></select></label></fieldset>`).join("");
  const form = await DialogV2.prompt({classes:["pte-dialog"],
    window:{title:opposed ? "Opposed Skill Check" : "Group Skill Check"},
    content:`<div style="max-height:62vh;overflow:auto">${opposed ? "" : '<label>Base Challenge Rating <input name="cr" type="number" min="0" value="2"></label>'}${fields}</div>`,
    ok:{label:"Roll",callback:(event,button)=>new FormData(button.form)},rejectClose:false
  });
  if (!form) return;
  const choices = participants.map((participant,index)=>({
    participant,index:Number(form.get(`skill${index}`)),threshold:Number(form.get(`mode${index}`))
  }));
  if (choices.some(choice=>!skills[choice.index] || ![3,4,5].includes(choice.threshold))) return;
  const results = await Promise.all(choices.map(async ({participant,index,threshold})=>{
    const key = `s${index}`;
    const trained = pokemon(participant) ? pokemonSkillTrainingDice(participant.system,key) : 0;
    const roll = await new Roll(`${participant.system.skills[key] + trained}d6`).evaluate();
    const dice = roll.dice[0].values;
    return {name:participant.name,skill:skills[index],roll,dice,successes:successes(dice,skillThreshold(participant,index,threshold)),total:dice.reduce((sum,value)=>sum+value,0)};
  }));
  let outcome;
  if (opposed) {
    const comparison = opposedResult(results[0],results[1]);
    outcome = comparison ? `${escape(results[comparison > 0 ? 0 : 1].name)} wins` : "Tie · GM adjudication";
  } else {
    const cr = Math.max(0,Math.trunc(Number(form.get("cr")) || 0)) + participants.length;
    const total = results.reduce((sum,result)=>sum+result.successes,0);
    outcome = `${total} successes vs CR ${cr} · ${total >= cr ? "Pass" : "Fail"}`;
  }
  const details = results.map(result=>`<li>${escape(result.name)} · ${escape(result.skill)} · ${result.dice.join(", ")} · ${result.successes} successes · dice total ${result.total}</li>`).join("");
  return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),rolls:results.map(result=>result.roll),
    content:`<p><strong>${opposed ? "Opposed Check" : "Group Check"} · ${outcome}</strong></p><ul>${details}</ul>`});
}

const battleSlotsUsed = actor => actor.items.filter(item=>
  item.type === "move" && !item.system.knownOnly && !item.system.slotExempt).length;

async function resetAttackScene(actor) {
  if (!actor.isOwner) return;
  const pool = actionPool(actor);
  const owners = new Set([actor.uuid,pool.owner.uuid]);
  if ([...owners].some(id=>pendingGear.has(id))) {
    return ui.notifications.warn("Wait for the current action to finish before resetting the attack scene.");
  }
  for (const id of owners) pendingGear.add(id);
  try {
    const clearActions = key => Object.fromEntries(actions.map(action=>[`system.${key}.${action}`,false]));
    const changes = {
      "system.attackScene":actor.system.attackScene + 1,
      "system.attackTurn":0,
      ...clearSceneConsumables(actor.system),
      ...clearActions("actions")
    };
    if (pool.owner === actor && actor.type === "trainer") Object.assign(changes,clearActions("partnerActions"));
    await actor.update(changes);
    if (pool.owner !== actor) {
      if (!pool.owner.isOwner) {
        return ui.notifications.warn("Attack usage reset. Ask the Trainer’s owner or GM to reset shared Pokémon actions.");
      }
      await pool.owner.update(clearActions(pool.key));
    }
    ui.notifications.info(`${actor.name}’s attack scene was reset.`);
  } finally {
    for (const id of owners) pendingGear.delete(id);
  }
}

async function trackedMove(actor,item) {
  if (!actor.isOwner || item?.type !== "move") return;
  const pool = actionPool(actor);
  if (!pool.owner.isOwner) return ui.notifications.warn("Only a Trainer owner or the GM can spend this action.");
  const locks = new Set([actor.uuid,item.uuid,pool.owner.uuid]);
  if ([...locks].some(key=>pendingGear.has(key))) return;
  locks.forEach(key=>pendingGear.add(key));
  try {
    await useMove(actor,item,pool);
  } finally {
    locks.forEach(key=>pendingGear.delete(key));
  }
}

async function spendMove(actor,item,pool,cost = moveActionCost(item.system.action),spiritCost = 0) {
  if (!cost) return {error:"This action cost requires manual resolution. Use Roll Only."};
  const plan = moveUsePlan(item.system,actor.system.attackTurn,actor.system.attackScene);
  if (plan.error) return plan;
  const error = maneuverCostError(pool,cost);
  if (error) return {error};
  const actionChanges = spent => Object.fromEntries(cost.map(key=>[`system.${pool.key}.${key}`,spent]));
  const previousSpirit = actor.system.spirit;
  const remainingSpirit = spiritBalance(previousSpirit,-spiritCost);
  if (remainingSpirit === null) return {error:"This combatant does not have enough Spirit Points."};
  if (cost.length) await pool.owner.update(actionChanges(true));
  let paid = false;
  try {
    if (spiritCost) {
      await actor.update({"system.spirit":remainingSpirit});
      paid = true;
    }
    await item.update(plan.updates);
  } catch (error) {
    const rollback = [];
    if (cost.length) rollback.push(pool.owner.update(actionChanges(false)));
    if (paid) rollback.push(actor.update({"system.spirit":previousSpirit}));
    await Promise.allSettled(rollback);
    throw error;
  }
  return {cost};
}

async function useMove(actor, item, pool = null) {
  if (item?.type !== "move") return;
  if (item.system.knownOnly) return ui.notifications.warn("Move this attack to the Moves list first.");
  if (actor.system.health.value <= 0) return ui.notifications.warn("This combatant has fainted.");
  const move = item.system;
  if (move.weaponId) {
    const weapon = actor.items.get(move.weaponId);
    if (!weapon?.system.equipped || weapon.system.inStorage || weapon.system.impaired || weapon.system.quantity < 1) {
      return ui.notifications.warn("Equip the usable weapon that grants this attack.");
    }
    if (weapon.system.weaponRank > (actor.system.skills[weapon.system.weaponSkill] ?? 0)) {
      return ui.notifications.warn("The holder does not meet this weapon’s qualifying skill rank.");
    }
  }
  if (move.category === "Status" && afflicted(actor,"enraged")) return ui.notifications.warn("Enraged combatants cannot use status attacks.");
  if (move.category === "WT") return ui.notifications.warn("Set this weapon attack to Physical or Special before rolling.");
  if (move.frequency === "Static") return ui.notifications.info("This attack has a static effect.");
  const variableDb = move.variableDb || catalogListing(item)?.stats?.variableDb;
  let baseDb = move.db;
  if (variableDb) {
    const result = await DialogV2.prompt({classes:["pte-dialog"],window:{title:`${item.name} · Variable Damage Base`},
      content:`<label>Base Damage (DB) · ${escape(variableDb)} <input name="db" type="number" min="1" max="28" step="1"></label>
        <p>Enter the Damage Base specified by the effect before STAB. Leave blank to roll accuracy and resolve damage or HP loss manually.</p>`,
      ok:{label:"Roll",callback:(event,button)=>new FormData(button.form).get("db")},rejectClose:false});
    if (result == null) return;
    baseDb = result === "" ? 0 : Number(result);
    if (result !== "" && (!Number.isInteger(baseDb) || baseDb < 1 || baseDb > 28)) return ui.notifications.warn("Enter a Damage Base from 1 to 28.");
  }
  const needsAccuracy = move.accuracyRequired !== false;
  const roll = await new Roll("1d20 + @accuracy", {accuracy:accuracyModifier(actor)}).evaluate();
  const natural = roll.dice[0].values[0];
  const critical = move.category !== "Status" && natural >= Math.max(1,move.crit - capCombatModifier(potionBonus(actor,"crit") + gearBonus(actor,"crit")));
  const special = move.category === "Special";
  const db = baseDb + (elements(actor).includes(move.element) ? 2 : 0);
  const damage = move.category === "Status" || baseDb === 0 ? null :
    await new Roll(damageFormula(db, critical, combatStat(actor,special ? "spa" : "atk"), move.damage)).evaluate();
  const targets = [...game.user.targets].filter(token => token.actor);
  const results = targets.map(token => {
    const target = token.actor;
    const defense = move.category === "Status" ? 0 : combatStat(target,special ? "spd" : "def");
    const targetEvasion = attackEvasion(target,defense);
    const needed = move.ac + targetEvasion;
    const targetTypes = elements(target);
    const factor = effectiveness(move.element,targetTypes,{basic:item.basic});
    const manualDamage = !damage && ["Counter","Sonic Boom"].includes(catalogListing(item)?.name);
    const immune = factor === 0 && (damage || manualDamage);
    const hit = !immune && (!needsAccuracy || roll.total >= needed);
    const amount = hit && damage ? Math.floor(Math.max(0,damage.total-defense-effectiveReduction(target))*factor) : 0;
    const result = immune ? matchupLabel(0) : !hit ? "Miss" : !damage ? "Hit" : `Hit · ${amount} damage`;
    const typing = targetTypes.length ? ` (${targetTypes.map(escape).join(" / ")})` : "";
    const matchup = damage && !immune ? ` · ${matchupLabel(factor)}` : "";
    const vest = hit && move.category !== "Status" &&
      equippedGear(target).some(item=>item.name === (special ? "Psionic Vest" : "Assault Vest"));
    return {token,target,amount,vest,line:`<li>${escape(token.name)}${typing} · ${needsAccuracy ? `TN ${needed} · ` : ""}${result}${matchup}</li>`};
  });
  let tracked = "";
  if (pool) {
    const outcome = await spendMove(actor,item,pool,undefined,move.spiritCost || 0);
    if (outcome.error) return ui.notifications.warn(outcome.error);
    tracked = outcome.cost.length ? ` · Spent ${outcome.cost.map(titleCase).join(" + ")}` : " · Free action tracked";
    if (move.spiritCost) tracked += ` · ${move.spiritCost} SP spent (${actor.system.spirit} left)`;
  }
  const lines = results.map(result=>result.line);
  const range = [move.element,move.category,move.range,move.frequency,move.action].map(escape).join(" · ");
  await roll.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor:
    `<strong>${escape(item.name)}</strong><br>${range}${tracked}<br>${needsAccuracy ? `AC ${move.ac}` : "No AC · d20 for critical or effect ranges"}${critical ? " · Critical" : ""}
      ${damage ? ` · DB ${db} · Raw damage ${damage.total} (${escape(damage.formula)})` : variableDb ? " · Resolve damage or HP loss from the effect" : ""}
      ${lines.length ? `<ul>${lines.join("")}</ul>` : damage ? "<p>Target a token to calculate defenses and type effectiveness.</p>" : ""}<p>${escape(itemDescription(item)).replace(/\n/g,"<br>")}</p>`});
  if (pool) await applyMoveDamage(results);
}

const maneuverCostLabel = cost => cost.length ? cost.map(titleCase).join(" + ") : "Free";
const maneuverAccuracy = actor => new Roll("1d20 + @accuracy",{accuracy:accuracyModifier(actor)}).evaluate();

async function maneuverSkill(actor, name, mode) {
  const index = skills.indexOf(name);
  const key = `s${index}`;
  const trained = pokemon(actor) ? pokemonSkillTrainingDice(actor.system,key) : 0;
  const roll = await new Roll(`${actor.system.skills[key] + trained}d6`).evaluate();
  const dice = roll.dice[0].values;
  return {roll,successes:successes(dice,skillThreshold(actor,index,Number(mode))),
    total:dice.reduce((sum,value)=>sum+value,0)};
}

function maneuverSkillField(label, side, options) {
  return `<label>${label} <select name="${side}">${options.map(name=>`<option>${name}</option>`).join("")}</select></label>
    <label>Check modifier <select name="${side}Mode"><option value="4">Normal</option><option value="3">Boon</option><option value="5">Bane</option></select></label>`;
}

let initiativeTrackerQueue = Promise.resolve();

function initiativeToken(actor,scene,preferred) {
  if (actor.isToken) return {token:actor.token?.parent?.id === scene?.id ? actor.token : null, requiresToken:true};
  const candidates = Array.from(scene?.tokens.values() ?? []).filter(token=>token.actorId === actor.id && token.actor);
  const targeted = candidates.filter(token=>preferred.has(token.id));
  if (targeted.length === 1) return {token:targeted[0],requiresToken:true};
  const controlled = candidates.filter(token=>token.object?.controlled);
  if (controlled.length === 1) return {token:controlled[0],requiresToken:true};
  return {token:candidates.length === 1 ? candidates[0] : null,requiresToken:candidates.length > 0};
}

async function putInitiativeInTracker(scene,results) {
  if (globalThis.canvas?.scene?.id !== scene?.id) return "The scene changed before initiative could be added.";
  const ready = results.filter(({token,requiresToken,member})=>
    token ? scene?.tokens.has(token.id) : !requiresToken && game.actors.has(member.id));
  if (!ready.length) return "Select the intended token on the current scene and roll again.";
  const matchesScene = combat => combat && (!combat.scene || combat.scene.id === scene?.id);
  let combat = [game.combat,game.combats.viewed,...game.combats].find(matchesScene);
  if (!combat && !game.user.isGM) return "Ask the GM to create an encounter before rolling into the tracker.";
  try {
    if (!combat) combat = await CONFIG.Combat.documentClass.create({scene:scene?.id ?? null,active:true});
    if (!combat) return "The Combat Tracker encounter could not be created.";
    let updated = 0;
    for (const result of ready) {
      const {token,member,initiative} = result;
      try {
        const combatants = Array.from(combat.combatants.values());
        const existing = token && combatants.find(entry=>entry.tokenId === token.id && entry.token?.parent?.id === scene.id);
        const actorOnly = !member.isToken && combatants.find(entry=>!entry.tokenId && entry.actorId === member.id);
        if (existing || actorOnly) {
          const entry = existing ?? actorOnly;
          if (token && !existing) await entry.update({tokenId:token.id,sceneId:scene.id,hidden:token.hidden});
          await combat.setInitiative(entry.id,initiative);
          if (entry.initiative === initiative) updated++;
        } else if (token) {
          const [entry] = await CONFIG.Token.documentClass.createCombatants([token],{combat});
          if (!entry) continue;
          await combat.setInitiative(entry.id,initiative);
          if (entry.initiative === initiative) updated++;
        } else {
          const created = await combat.createEmbeddedDocuments("Combatant",[{actorId:member.id,initiative}]);
          if (created.length) updated++;
        }
      } catch (error) {
        console.warn("PTE could not register a combatant's initiative.",error);
      }
    }
    return updated === results.length ? `Combat Tracker updated for ${updated} combatant${updated === 1 ? "" : "s"}.` :
      `Combat Tracker updated for ${updated} of ${results.length}. Check token selection, scene placement, and encounter permissions.`;
  } catch (error) {
    console.warn("PTE could not add initiative results to the Combat Tracker.",error);
    return "The Combat Tracker could not add these tokens. Ask the GM to check the encounter permissions.";
  }
}

async function rollInitiative(actor, party) {
  const scene = globalThis.canvas?.scene;
  const targeted = [...game.user.targets].map(token=>token.document)
    .filter(token=>token?.actor && token.parent?.id === scene?.id);
  const preferred = new Set(targeted.map(token=>token.id));
  const primary = initiativeToken(actor,scene,preferred);
  const selected = party ? targeted : [];
  const entries = [...new Map([
    ...(primary.token || !selected.some(token=>token.actorId === actor.id) ? [{member:primary.token?.actor ?? actor,...primary}] : []),
    ...selected.map(token=>({member:token.actor,token,requiresToken:true}))
  ].map(entry=>[entry.token?.uuid || entry.member.uuid,entry])).values()];
  const participants = entries.map(entry=>entry.member);
  if (participants.some(member=>!member.isOwner || !["trainer","pokemon"].includes(member.type))) {
    return ui.notifications.warn("Choose combatants you own, or have the GM roll for this party.");
  }
  if (participants.some(member=>member.system.health.value <= 0)) {
    return ui.notifications.warn("Remove fainted combatants before rolling initiative.");
  }
  const fields = participants.map((member,index)=>
    `<fieldset><legend>${escape(member.name)}</legend>${maneuverSkillField("Initiative skill",`skill${index}`,skills)}
      ${party ? "" : `<p>Speed modifier +${initiativeSpeedModifier(combatStat(member,"spe"))}</p>`}</fieldset>`).join("");
  const form = await DialogV2.prompt({classes:["pte-dialog"],window:{title:party ? "Party Initiative" : "Initiative"},
    content:`<p>${party ? "This sheet and targeted tokens are one party. Roll for each opposing party separately." : "Choose the skill that reflects how you enter the encounter."}</p>
      <div style="max-height:60vh;overflow:auto">${fields}</div>`,
    ok:{label:"Roll Initiative",callback:(event,button)=>new FormData(button.form)},rejectClose:false});
  if (!form || participants.some(member=>!member.isOwner || member.system.health.value <= 0)) return;
  const choices = entries.map((entry,index)=>({...entry,skill:form.get(`skill${index}`),mode:Number(form.get(`skill${index}Mode`))}));
  if (choices.some(choice=>!skills.includes(choice.skill) || ![3,4,5].includes(choice.mode))) return;
  const results = await Promise.all(choices.map(async ({member,token,requiresToken,skill,mode})=>{
    const check = await maneuverSkill(member,skill,mode);
    const modifier = party ? 0 : initiativeSpeedModifier(combatStat(member,"spe"));
    return {...check,member,token,requiresToken,name:token?.name || member.name,skill,modifier,initiative:check.successes + modifier};
  }));
  const trackerUpdate = initiativeTrackerQueue.then(()=>putInitiativeInTracker(scene,results));
  initiativeTrackerQueue = trackerUpdate.catch(()=>{});
  const tracker = await trackerUpdate;
  const total = results.reduce((sum,result)=>sum + result.initiative,0);
  const highest = Math.max(...results.map(result=>result.initiative));
  const details = results.map(result=>`<li>${escape(result.name)} · ${escape(result.skill)} · ${result.successes} successes
    ${party ? "" : `+ ${result.modifier} Speed = <strong>${result.initiative}</strong>`}</li>`).join("");
  return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),rolls:results.map(result=>result.roll),
    content:`<strong>${party ? `Party Initiative · Total ${total} · Highest ${highest}` : `Initiative · ${total}`}</strong>
      <ul>${details}</ul><p>${escape(tracker)}</p>${party ? "<p>Compare party totals or highest results using your table’s initiative rule.</p>" : ""}`});
}

async function useManeuver(actor,key,rules) {
  if (!actor.isOwner || !Object.hasOwn(maneuvers,key)) return;
  if (actor.system.health.value <= 0) return ui.notifications.warn("This combatant has fainted.");
  const maneuver = maneuvers[key];
  const targets = [...game.user.targets].filter(token=>token.actor);
  if (maneuver.target && targets.length !== 1) return ui.notifications.warn("Target one token for this maneuver.");
  if (key === "opportunity") return rollBasicAttack(actor,{opportunity:true});
  const target = maneuver.target ? targets[0].actor : null;
  const targetName = maneuver.target ? targets[0].name : "";
  const shieldToken = key === "defend" && equippedShield(actor) && actor.getActiveTokens().find(token=>adjacentTokens(token,targets[0]));
  const pool = actionPool(actor);
  const locks = new Set([actor.uuid,pool.owner.uuid]);
  if ([...locks].some(id=>pendingGear.has(id))) return;
  locks.forEach(id=>pendingGear.add(id));
  try {
    if (key === "riposte") return await useRiposte(actor,maneuver,target,targetName,pool);
    const opposed = maneuver.opposed;
    const defenderCheck = (opposed || key === "provoke") && target.isOwner;
    const form = await DialogV2.prompt({classes:["pte-dialog"],window:{title:maneuver.name},
      content:`<p>${escape(rules)}</p>
        ${targetName ? `<p>Target · ${escape(targetName)}</p>` : ""}
        <label>Action cost <select name="cost">${maneuver.cost.map((cost,index)=>
          `<option value="${index}">${maneuverCostLabel(cost)}</option>`).join("")}</select></label>
        ${opposed ? maneuverSkillField("Your skill","acting",opposed.acting) : ""}
        ${defenderCheck ? maneuverSkillField("Target skill","defending",opposed?.defending || ["Focus"]) : ""}
        ${key === "provoke" ? '<label><input type="checkbox" name="retry"> Previously failed against this target this scene (CR 2)</label>' : ""}
        ${key === "throw" ? '<label><input type="checkbox" name="adjacent"> Adjacent target (Sureshot)</label>' : ""}
        <label><input type="checkbox" name="manual"> Handle action cost manually</label>`,
      ok:{label:"Use Maneuver",callback:(event,button)=>new FormData(button.form)},rejectClose:false});
    if (!form || actor.system.health.value <= 0) return;
    const cost = maneuver.cost[Number(form.get("cost"))];
    if (!cost) return;
    const accuracy = maneuver.ac && !(key === "throw" && form.has("adjacent")) ? await maneuverAccuracy(actor) : null;
    const tn = accuracy ? maneuver.ac + attackEvasion(target,0) : null;
    const hit = !accuracy || accuracy.total >= tn;
    const rolls = accuracy ? [accuracy] : [];
    const outcomes = accuracy ? [`Accuracy ${accuracy.total} vs TN ${tn} · ${hit ? "Hit" : "Miss"}`] : [];
    if (hit && opposed) {
      const acting = await maneuverSkill(actor,form.get("acting"),form.get("actingMode"));
      rolls.push(acting.roll);
      outcomes.push(`${form.get("acting")} · ${acting.successes} successes (dice total ${acting.total})`);
      if (defenderCheck && target.isOwner) {
        const defender = await maneuverSkill(target,form.get("defending"),form.get("defendingMode"));
        rolls.push(defender.roll);
        const result = opposedResult(acting,defender);
        outcomes.push(`${form.get("defending")} · ${defender.successes} successes (dice total ${defender.total}) · ${result > 0 ? "User wins" : result < 0 ? "Defender wins" : "Tie"}`);
      } else outcomes.push("Have the target’s owner roll the defending skill check.");
    }
    if (hit && key === "provoke") {
      const cr = form.has("retry") ? 2 : 3;
      if (defenderCheck && target.isOwner) {
        const defender = await maneuverSkill(target,"Focus",form.get("defendingMode"));
        rolls.push(defender.roll);
        outcomes.push(`Focus · ${defender.successes} successes vs CR ${cr} · ${defender.successes < cr ? "Provoked" : "Resisted"}`);
      } else outcomes.push(`Target’s owner rolls Focus against CR ${cr}.`);
    }
    if (hit && key === "sprint") outcomes.push(cost[0] === "standard" ? "Double Movement this turn." : "+2 Movement this turn.");
    if (hit && key === "throw") outcomes.push(`Throw range · ${4 + actor.system.skills[`s${skills.indexOf("Athletics")}`]}m.`);
    if (!form.has("manual")) {
      const error = maneuverCostError(pool,cost);
      if (error) return ui.notifications.warn(error);
      if (cost.length) await pool.owner.update(maneuverActionUpdates(pool,cost,true));
    }
    if (shieldToken && target?.isOwner && equippedShield(actor) && adjacentTokens(shieldToken,targets[0])) {
      const protection = await protectWithShield(actor,target,shieldToken,targets[0]);
      outcomes.push(`Shield: ${targetName} gains ${protection} Damage Reduction while adjacent until your next turn.`);
    }
    return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),rolls,content:
      `<strong>${maneuver.name}</strong>${targetName ? ` · ${escape(targetName)}` : ""}<br>
        ${maneuverCostLabel(cost)}${form.has("manual") ? " · Track manually" : cost.length ? " · Spent" : ""}
        ${outcomes.map(outcome=>`<br>${escape(outcome)}`).join("")}${hit ? `<p>${escape(rules)}</p>` : ""}`});
  } finally {
    locks.forEach(id=>pendingGear.delete(id));
  }
}

function maneuverCostError(pool,cost) {
  if (!cost.length) return;
  if (!pool.owner.isOwner) return "Only a Trainer owner or the GM can spend these actions.";
  if (cost.some(key=>pool.owner.system[pool.key][key])) return "A required action is already spent.";
}

const maneuverActionUpdates = (pool,cost,spent) =>
  Object.fromEntries(cost.map(key=>[`system.${pool.key}.${key}`,spent]));

async function useRiposte(actor,maneuver,attacker,targetName,pool) {
  const scene = actor.system.attackScene;
  if (actor.system.riposteScene === scene) return ui.notifications.warn("Riposte already succeeded this scene.");
  const damaging = item=>item?.type === "move" && ["Physical","Special"].includes(item.system.category) &&
    !item.system.knownOnly && item.system.frequency !== "Static" && (item.system.db > 0 || item.system.variableDb);
  const moves = actor.items.filter(damaging);
  const form = await DialogV2.prompt({classes:["pte-dialog"],window:{title:"Riposte"},
    content:`<p>Target · ${escape(targetName)}. Verify the trigger, positioning, and matchup against the incoming attack’s type.</p>
      <label>Attack <select name="move" required><option value="">Choose a damaging attack</option>${moves.map(item=>
        `<option value="${escape(item.id)}">${escape(item.name)}</option>`).join("")}</select></label>
      <label>Incoming raw damage <input name="incoming" type="number" min="0" step="1" required></label>
      <label>Damage Base override <input name="db" type="number" min="1" max="28" step="1" placeholder="Required for variable DB"></label>
      <label><input type="checkbox" name="boosted"> Chosen attack is super effective against the incoming attack’s type</label>
      <label><input type="checkbox" name="manual"> Handle action cost and attack use manually</label>`,
    ok:{label:"Roll Riposte",callback:(event,button)=>new FormData(button.form)},rejectClose:false});
  if (!form || actor.system.health.value <= 0 || actor.system.attackScene !== scene) return;
  const item = actor.items.get(form.get("move"));
  if (!damaging(item)) return ui.notifications.warn("Choose a usable damaging attack.");
  const db = Number(form.get("db") || (item.system.variableDb ? 0 : item.system.db));
  const incoming = Number(form.get("incoming"));
  if (!Number.isInteger(db) || db < 1 || db > 28 || form.get("incoming") === "" ||
    !Number.isSafeInteger(incoming) || incoming < 0) return ui.notifications.warn("Enter incoming damage and a valid Damage Base.");
  const cost = maneuver.cost[0];
  const manual = form.has("manual");
  const accuracy = await maneuverAccuracy(actor);
  const tn = maneuver.ac + attackEvasion(attacker,0);
  const hit = accuracy.total >= tn;
  const boosted = accuracy.dice[0].values[0] === 20 || form.has("boosted");
  const base = db + (elements(actor).includes(item.system.element) ? 2 : 0);
  const damage = hit ? await new Roll(damageFormula(base,false,
    combatStat(actor,item.system.category === "Special" ? "spa" : "atk"),item.system.damage)).evaluate() : null;
  if (actor.system.attackScene !== scene || actor.system.riposteScene === scene || !damaging(actor.items.get(item.id))) return;
  if (!manual) {
    const outcome = await spendMove(actor,item,pool,cost);
    if (outcome.error) return ui.notifications.warn(outcome.error);
  }
  if (hit) await actor.update({"system.riposteScene":scene});
  const result = damage ? riposteDamageResult(incoming,damage.total,boosted,attacker.system.health.max) : null;
  return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),rolls:damage ? [accuracy,damage] : [accuracy],content:
    `<strong>Riposte</strong> · ${escape(targetName)} · ${escape(item.name)}<br>
      Accuracy ${accuracy.total} vs TN ${tn} · ${hit ? "Hit" : "Miss"}<br>
      ${manual ? "Track Standard, Reaction, and the move use manually." : "Spent Standard + Reaction and one attack use."}<br>
      ${result ? `Riposte damage ${result.counter}${boosted ? " (×1.5)" : ""} vs incoming raw damage ${incoming} ·
        ${result.remaining ? `${result.remaining} raw damage remains` : "Incoming attack misses all targets"}.
        ${result.hpLoss ? `Attacker loses ${result.hpLoss} HP.` : ""}` : "Resolve the incoming attack normally."}`});
}

async function rollBasicAttack(actor,{opportunity = false} = {}) {
  if (!actor.isOwner) return;
  const types = elements(actor);
  const form = await DialogV2.prompt({classes:["pte-dialog"],
    window:{title:opportunity ? "Attack of Opportunity" : "Basic Attack"},
    content:`<label>Category <select name="category"><option>Physical</option><option>Special</option></select></label>
      <label>Type <select name="element">${[...new Set(["Normal",...types])].map(type=>`<option>${escape(type)}</option>`).join("")}</select></label>
      <label>Profile <select name="profile">${Object.entries(basicAttackProfiles).map(([key,entry])=>`<option value="${key}">${entry.label}</option>`).join("")}</select></label>
      <label><input type="checkbox" name="manual"> Roll only · action handled manually</label>
      <p>Check range, adjacency, and eligibility for the selected profile at the table.</p>`,
    ok:{label:"Roll",callback:(event,button)=>new FormData(button.form)},rejectClose:false
  });
  if (!form) return;
  const data = basicAttackData(form.get("category"),form.get("element"),form.get("profile"),elements(actor));
  if (!data) return;
  const item = {name:opportunity ? "Attack of Opportunity" : "Basic Attack",type:"move",basic:true,uuid:`${actor.uuid}.BasicAttack`,
    system:{...actor.system.basicAttack,...data,...(opportunity ? {action:"Reaction"} : {})},
    update:changes=>actor.update(Object.fromEntries(Object.entries(changes).map(([path,value])=>
      [path.replace("system.","system.basicAttack."),value])))};
  if (form.has("manual")) return useMove(actor,item);
  return trackedMove(actor,item);
}

async function applyMoveDamage(results) {
  const writable = new Map();
  for (const hit of results) {
    if ((!hit.amount && !hit.vest) || !hit.target.isOwner) continue;
    const prior = writable.get(hit.target.uuid);
    if (!prior || hit.amount > prior.amount) writable.set(hit.target.uuid,hit);
  }
  const eligible = [...writable.values()];
  if (!eligible.length) return;
  const form = await DialogV2.prompt({classes:["pte-dialog"],
    window:{title:"Apply Rolled Damage"},
    content:`<p>Apply to selected targets you can edit. Identical linked actors are listed once. Resolve special defenses at the table.</p>
      ${eligible.map((hit,index)=>`<label><input type="checkbox" name="target" value="${index}"> ${escape(hit.token.name)} · ${hit.amount} damage${hit.vest ? " · vest grants temporary HP if still conscious" : ""}</label>`).join("")}`,
    ok:{label:"Apply Selected",callback:(event,button)=>new FormData(button.form)},
    rejectClose:false
  });
  if (!form) return;
  const selected = new Set(form.getAll("target"));
  const changes = await Promise.allSettled(eligible.filter((hit,index)=>selected.has(String(index)) && hit.target.isOwner)
    .map(hit=>{
      const system = hit.target.system;
      const updates = combatDamageUpdate(system,hit.amount);
      if (hit.vest && updates["system.health.value"] > 0) {
        updates["system.health.temp"] = Math.max(updates["system.health.temp"],Math.floor(system.health.max / 10));
      }
      return hit.target.update(updates);
    }));
  if (changes.some(change=>change.status === "rejected")) ui.notifications.warn("Some target damage could not be applied. Check the target sheets.");
}

const itemTypes = {move:"Moves",gear:"Bag",feature:"Features",class:"Classes"};

const listingKey = (type, source, name) => `${type}|${source}|${name}`;
const catalogListings = new Map(catalog.map(entry => [
  listingKey(entry.kind, entrySource(entry), entry.name),entry
]));
const catalogListing = item => catalogListings.get(listingKey(item.type,item.system.source,item.name)) ||
  (item.system.weaponId ? weaponAttackEntries.find(entry=>entry.source === item.system.source) : null);
const roleCategory = "Pokémon Roles";
const isRoleItem = item => catalogListing(item)?.category === roleCategory;
const abilityCategory = "Pokémon Abilities";
const isAbilityItem = item => catalogListing(item)?.category === abilityCategory;
const pokemonCatalogFeature = entry => entry?.kind === "feature" &&
  [roleCategory,abilityCategory].includes(entry.category);
const abilitiesByName = new Map(catalog.filter(entry=>entry.category === abilityCategory)
  .map(entry=>[normalizeAbilityName(entry.name),entry]));
const gearPrice = item => item.system.price || catalogListing(item)?.price || "";

const catalogNames = new Set(catalog.filter(entry=>entry.kind === "class" || entry.kind === "feature")
  .map(entry=>normalizeRequirement(entry.name)));

function catalogRequirementContext(actor) {
  const owned = new Set();
  const classes = new Set();
  const featureCounts = new Map();
  const counted = new Set();
  const classPrerequisites = new Set();
  for (const item of actor.items) {
    if (item.type !== "class" && item.type !== "feature") continue;
    const name = normalizeRequirement(item.name);
    owned.add(name);
    if (item.type === "class") classes.add(name);
    const listing = catalogListing(item);
    if (item.type === "class" || featureClass(listing)) {
      for (const line of listing?.prerequisites || []) {
        for (const alternative of normalizeRequirement(line).replace(/\s*\[or\]$/, "").split(" or ")) {
          classPrerequisites.add(alternative);
        }
      }
    }
    if (item.type !== "feature" || !listing || counted.has(name)) continue;
    counted.add(name);
    const group = normalizeRequirement(listing.category);
    featureCounts.set(group,(featureCounts.get(group) || 0)+1);
  }
  const legacyClass = normalizeRequirement(actor.system.trainerClass || "");
  if (legacyClass) {
    classes.add(legacyClass);
    owned.add(legacyClass);
  }
  const capabilities = new Set();
  for (const value of [actor.system.capabilityNotes || "", ...grantedCapabilities(actor)]) {
    if (/\bnaturewalk\b/i.test(value)) capabilities.add("naturewalk");
  }
  return {level:actor.system.level,skills:actor.system.skills,owned,classes,featureCounts,catalogNames,classPrerequisites,capabilities};
}

const supplementalFeaturePrerequisites = new Map([
  ["Martial Combat", ["Fighter or a Class Feature with Fighter as a possible Prerequisite"]],
  ["Elemental Affinity", ["GM Permission"]],
  ["Elemental Detection", ["Elemental Affinity (Any)"]],
  ["Elemental Expertise", ["Any Elementalist Class", "Level 5"]],
  ["Elemental Fabrication", ["Elemental Affinity (Grass, Ground, Poison, Rock, Steel)"]],
  ["Elemental Immunity", ["Elemental Affinity (Dark, Electric, Fire, Fairy, Ghost, Ice, Poison or Psychic)"]],
  ["Elemental Manipulation", ["Elemental Affinity (Any)"]],
  ["Elemental Prowess", ["Elemental Affinity (Any)"]]
]);
const catalogPrerequisites = entry => entry.prerequisites ?? supplementalFeaturePrerequisites.get(entry.name) ?? [];
const requiresGM = /\bGM (?:approval|permission)\b/i;
const trainerFeature = entry => entry?.kind === "feature" && !pokemonCatalogFeature(entry);
function catalogRequirementResult(entry, context) {
  const prerequisites = catalogPrerequisites(entry);
  return requirementResult(entry.kind === "class" ? prerequisites.map(line=>
    line.replace(/ Bind (?:X|\d+) - .* Action$/i,"")) : prerequisites,context);
}

async function acquisitionCheck(actor, entry) {
  if (entry?.category === roleCategory) {
    if (!pokemon(actor)) return {error:"Pokémon Roles can only be added to Pokémon."};
    const roles = actor.items.filter(isRoleItem);
    if (roles.some(item=>normalizeRequirement(item.name) === normalizeRequirement(entry.name))) {
      return {error:"This Pokémon already has that role."};
    }
    const legacy = normalizeRequirement(actor.system.role || "");
    const separateLegacyRole = legacy && !roles.some(item=>normalizeRequirement(item.name) === legacy);
    const replacingLegacy = separateLegacyRole && legacy === normalizeRequirement(entry.name);
    const roleCount = roles.length + Number(Boolean(separateLegacyRole));
    if (roleCount >= 2 && !replacingLegacy) return {error:"This Pokémon already has two roles."};
    if (roleCount && !replacingLegacy) {
      if (actor.system.level < 30) return {error:"A second Pokémon Role requires level 30."};
      if (actor.items.filter(isAbilityItem).length >= 2) {
        return {review:"Verify an alternate grant. The normal level 30 benefit is a second role or a second ability."};
      }
    }
    return {};
  }
  if (!entry) return {review:"A custom class, feature, or move requires GM approval."};
  const prerequisites = catalogPrerequisites(entry);
  const context = catalogRequirementContext(actor);
  const result = catalogRequirementResult(entry, context);
  if (trainerFeature(entry) && prerequisites.some(line=>requiresGM.test(line)) && canReviewFeature(entry,context)) {
    return {review:"GM approval is required. " + prerequisites.join(" / ")};
  }
  if (result === false) return {error:"Prerequisites unmet. " + prerequisites.join(" / ")};
  if (result === null && trainerFeature(entry)) {
    return {error:"This feature’s prerequisites could not be verified. " + prerequisites.join(" / ")};
  }
  if (result === null) return {review:"Confirm the requirements in the Rule Book. " + prerequisites.join(" / ")};
  if (entry.category === "Pokémon Abilities" && !pokemon(actor)) {
    return {review:"A Trainer needs a rule or feature granting this Pokémon ability."};
  }
  if (entry.kind === "move" && (!pokemon(actor) || entry.category !== "Moves")) {
    return {review:"Confirm the class, feature, weapon, or other rule that grants this move."};
  }
  if (pokemon(actor) && (entry.category === "Pokémon Abilities" || entry.kind === "move")) {
    let profile;
    if (actor.system.dexPage) {
      try {
        profile = (await dexProfiles()).get(actor.system.dexPage);
      } catch {
        return {review:"The Pokédex could not load. Check the species entry before granting this option."};
      }
    }
    if (profile && normalizeRequirement(profile.name) !== normalizeRequirement(actor.system.species || "")) profile = null;
    const eligibility = speciesRequirement(entry,profile,actor.system.level);
    if (eligibility.error || eligibility.review) return eligibility;
    if (entry.category === "Pokémon Abilities") {
      const abilities = actor.items.filter(item=>catalogListing(item)?.category === "Pokémon Abilities");
      if (abilities.some(item=>normalizeAbilityName(item.name) === normalizeAbilityName(entry.name))) {
        return {error:"This Pokémon already has that ability."};
      }
      if (abilities.length) {
        const roles = actor.items.filter(isRoleItem);
        const legacy = normalizeRequirement(actor.system.role || "");
        const roleCount = roles.length + Number(Boolean(legacy && !roles.some(item=>normalizeRequirement(item.name) === legacy)));
        if (actor.system.level < 30) return {review:"The normal second ability unlocks at level 30. Verify a separate grant."};
        if (roleCount >= 2 || abilities.length >= 2) return {review:"The normal extra Role or Ability has already been taken. Verify a separate grant."};
      }
    }
  }
  return {};
}

const grantEntries = new Map(catalog.map(entry=>[`${entry.kind}|${normalizeRequirement(entry.name)}`,entry]));
const grantEntry = reward => reward.kind === "capability"
  ? capabilityEntries.find(entry=>normalizeRequirement(entry.name) === normalizeRequirement(reward.name.replace(/^Naturewalk \(.*\)$/i,"Naturewalk"))) ??
    bookCatalog.find(entry=>entry.category === "Occult Capabilities" && normalizeRequirement(entry.name) === normalizeRequirement(reward.name))
  : grantEntries.get(`${reward.kind}|${normalizeRequirement(reward.name)}`);
const grantedCapabilities = actor => [...new Set(actor.items.contents.flatMap(item=>
  Object.values(item.getFlag(ID,"classGrants") || {}).flatMap(rewards=>
    rewards.filter(reward=>reward.kind === "capability").map(reward=>reward.name))))];

function actorNaturewalks(actor) {
  const text = normalizeRequirement([actor.system.capabilityNotes || "",...grantedCapabilities(actor)].join(" "));
  return new Set([...text.matchAll(/\bnaturewalk\s*\(([^)]+)\)/g)]
    .flatMap(match=>match[1].split(",").map(value=>value.trim())));
}

function grantOptions(grant, actor) {
  if (grant.id !== "adaptation") return grant.options;
  const terrains = actorNaturewalks(actor);
  return grant.options.filter(list=>list.every(reward=>terrains.has(normalizeRequirement(reward.terrain))));
}

function grantsFor(item) {
  const entry = catalogListing(item);
  if (!entry || !classEffect(entry)) return [];
  const actor = item.parent;
  const featureCount = actor ? new Set(actor.items.filter(owned=>owned.type === "feature" &&
    catalogListing(owned)?.category === entry.name).map(owned=>owned.name)).size : 0;
  const claims = item.getFlag(ID,"classGrants") || {};
  return advancementGrants(entry,classEffect(entry),grantEntry).map(grant=>({
    ...grant,options:actor ? grantOptions(grant,actor) : grant.options,claimed:claims[grant.id],ready:Boolean(actor && featureCount >= (grant.minFeatures || 0) && actor.system.level >= (grant.minLevel || 1) &&
      (!grant.requiresPrevious || claims[grant.requiresPrevious]))
  }));
}

const pendingClassGrants = new Set();

async function claimGrant(item,id) {
  const actor = item.parent;
  if (!actor?.isOwner || actor.type !== "trainer" || pendingClassGrants.has(actor.uuid)) return;
  const grant = grantsFor(item).find(row=>row.id === id && row.ready && !row.claimed);
  if (!grant) return;
  pendingClassGrants.add(actor.uuid);
  let created = [];
  try {
    const capabilities = grantedCapabilities(actor);
    const previous = grant.requiresPrevious ? Object.values(item.getFlag(ID,"classGrants") || {}).flat() : [];
    const options = grant.options.filter(list=>list.every(reward=>grantEntry(reward) &&
      (!grant.count || reward.kind !== "capability" || !capabilities.includes(reward.name)) &&
      !previous.some(prior=>prior.kind === reward.kind && prior.name === reward.name)));
    if (options.length < Math.max(1,grant.count)) return ui.notifications.warn("This grant has too few available choices.");
    let rewards = options[0];
    if (grant.count) {
      const picked = await DialogV2.prompt({classes:["pte-dialog"],window:{title:grant.label},
        content:`<p>Choose ${grant.count}.</p>${options.map((list,index)=>
          `<label><input type="checkbox" name="reward" value="${index}"> ${escape(list.map(reward=>reward.terrain ? `${reward.name} (${reward.terrain})` : reward.name).join(" + "))}</label>`).join("")}`,
        ok:{label:"Grant",callback:(event,button)=>new FormData(button.form).getAll("reward")},rejectClose:false});
      if (picked == null) return;
      const indexes = [...new Set(picked)].map(Number);
      if (indexes.length !== grant.count || indexes.some(index=>!options[index])) {
        return ui.notifications.warn(`Choose exactly ${grant.count} options.`);
      }
      rewards = indexes.flatMap(index=>options[index]);
    }
    if (!actor.items.has(item.id) || !grantsFor(item).some(row=>row.id === id && row.ready && !row.claimed)) return;
    const data = rewards.filter(reward=>reward.kind !== "capability" && !actor.items.some(owned=>
      owned.type === reward.kind && normalizeRequirement(owned.name) === normalizeRequirement(reward.name))).map(reward=>{
        const data = catalogItemData(grantEntry(reward));
        if (reward.kind === "gear") data.system.equipped = true;
        return data;
      });
    if (data.length) created = await actor.createEmbeddedDocuments("Item",data);
    if (created.length !== data.length) throw Error("Could not create all granted items.");
    await item.setFlag(ID,`classGrants.${id}`,rewards);
    ui.notifications.info(`Granted: ${rewards.map(reward=>reward.name).join(", ")}`);
  } catch (error) {
    if (created.length) await actor.deleteEmbeddedDocuments("Item",created.map(reward=>reward.id));
    console.warn("PTE could not complete a class grant.",error);
    ui.notifications.warn("The class grant could not be completed.");
  } finally {
    pendingClassGrants.delete(actor.uuid);
  }
}

async function createCatalogItem(actor,data) {
  const [item] = await actor.createEmbeddedDocuments("Item",[data]);
  if (item && ["class","feature"].includes(item.type) && grantsFor(item).some(grant=>grant.id === "fixed")) {
    await claimGrant(item,"fixed");
  }
  return item;
}

function featureClass(entry) {
  if (entry?.kind !== "feature") return null;
  const name = entry.category === "Infernal Elementalist (example)" ? "Infernal Elementalist" : entry.category;
  return bookCatalog.find(candidate=>candidate.kind === "class" && candidate.name === name);
}

const trainerFeatureGroups = [
  {key:"class",label:"Class Features",addLabel:"Add Class Feature"},
  {key:"general",label:"General Features",addLabel:"Add General Feature"},
  {key:"talent",label:"Talents",addLabel:"Add Talent"},
  {key:"other",label:"Other Features",addLabel:"Add Other Feature"}
];

function trainerFeatureGroup(entry) {
  if (featureClass(entry)) return "class";
  if (entry?.category === "General Features") return "general";
  if (entry?.category === "Talents") return "talent";
  return "other";
}

function classFeatureEntries(entry,actor) {
  if (entry?.kind !== "class") return [];
  const context = actor ? catalogRequirementContext(actor) : null;
  return bookCatalog.flatMap((feature,index)=>{
    if (featureClass(feature) !== entry) return [];
    const owned = actor?.items.find(item=>catalogListing(item) === feature);
    return [{index,name:feature.name,description:catalogEffect(feature),prerequisites:feature.prerequisites,
      frequency:feature.frequency,action:feature.action,ownedId:owned?.id,
      canAdd:Boolean(actor?.isOwner && !owned && catalogRequirementResult(feature,context) === true)}];
  });
}

async function allowCatalogAcquisition(actor,data) {
  if (data.type === "gear") return true;
  const entry = data.system && catalogListing(data);
  if (pokemon(actor) && (data.type === "class" ||
    (data.type === "feature" && !pokemonCatalogFeature(entry)))) {
    ui.notifications.warn("Pokémon gain Roles and Abilities. Trainer features and talents belong on Trainer sheets.");
    return false;
  }
  const outcome = await acquisitionCheck(actor,entry);
  if (outcome.error) {
    ui.notifications.warn(outcome.error);
    return false;
  }
  if (!outcome.review) return true;
  if (!game.user.isGM) {
    ui.notifications.warn(`${outcome.review} Ask your GM to add the entry after checking.`);
    return false;
  }
  return DialogV2.confirm({classes:["pte-dialog"],window:{title:"Verify Prerequisite"},
    content:`<p>${escape(data.name)} · ${escape(outcome.review)}</p>`,
    yes:{label:"Grant Entry"},rejectClose:false});
}

function bindCatalogSearch(event,dialog) {
  const search = dialog.element.querySelector("[data-catalog-query]");
  const select = dialog.element.querySelector("[data-catalog-options]");
  const status = dialog.element.querySelector("[data-catalog-count]");
  const original = Array.from(select.children).map(child=>child.cloneNode(true));
  const filter = () => {
    const query = normalizeRequirement(search.value);
    const current = select.value;
    const matches = (option,category = "") => normalizeRequirement(`${option.textContent} ${category}`).includes(query);
    const visible = original.flatMap(node=>{
      if (node.tagName !== "OPTGROUP") return matches(node) ? [node.cloneNode(true)] : [];
      const options = [...node.children].filter(option=>matches(option,node.label));
      if (!options.length) return [];
      const group = node.cloneNode(false);
      group.append(...options.map(option=>option.cloneNode(true)));
      return [group];
    });
    select.replaceChildren(...visible);
    const count = select.options.length;
    if ([...select.options].some(option=>option.value === current)) select.value = current;
    status.textContent = count ? `${count} matching entries` : "No matches";
  };
  search.addEventListener("input",filter);
  filter();
}

const catalogSearchField = '<label>Search <input type="search" data-catalog-query placeholder="Search by name or category" autofocus></label><p role="status" data-catalog-count></p>';

function canReviewFeature(entry, context) {
  const prerequisites = catalogPrerequisites(entry).map(line=>line.replace(/,?\s*GM (?:approval|permission)\b/i,"").trim()).filter(Boolean);
  return requirementResult(prerequisites,context) === true;
}

function meetsPickerPrerequisites(entry, context) {
  return catalogRequirementResult(entry,context) === true ||
    (game.user.isGM && trainerFeature(entry) && catalogPrerequisites(entry).some(line=>requiresGM.test(line)) &&
      canReviewFeature(entry,context));
}

async function pickCatalogEntry(type, rolesOnly, actor, featureGroup) {
  const context = type === "class" || (type === "feature" && !rolesOnly) ? catalogRequirementContext(actor) : null;
  const entries = catalog.map((entry,index)=>({...entry,index})).filter(entry=>
    entry.kind === type && (entry.category === roleCategory) === rolesOnly &&
    (!pokemon(actor) || entry.category !== abilityCategory) &&
    (!featureGroup || trainerFeatureGroup(entry) === featureGroup.key) &&
    (!context || meetsPickerPrerequisites(entry,context)));
  if (context && !entries.length && featureGroup?.key !== "other") {
    ui.notifications.info(`No ${featureGroup?.label.toLowerCase() ?? (type === "class" ? "classes" : "features")} match this trainer’s current prerequisites.`);
    return null;
  }
  const groups = Object.groupBy(entries,entry=>entry.category);
  const allowCustom = !rolesOnly && type !== "class" && (!featureGroup || featureGroup.key === "other");
  const options = Object.entries(groups).map(([label,entries]) =>
    `<optgroup label="${escape(label)}">${entries.map(entry =>
      `<option value="${entry.index}">${escape(entry.name)}${entry.price ? ` · ${escape(entry.price)}` : ""} ${entry.page ? ` · p. ${entry.page}` : entry.stats ? ` · ${escape(entry.stats.element)}` : ""}</option>`
    ).join("")}</optgroup>`
  ).join("");
  const selection = await DialogV2.prompt({classes:["pte-dialog"],
    window:{title:rolesOnly ? "Add Pokémon Role" : featureGroup?.addLabel ?? `Add ${titleCase(type)}`},
    render:bindCatalogSearch,
    content:`${catalogSearchField}<label>Catalog <select name="entry" data-catalog-options>${allowCustom ? `<option value="custom">Custom ${escape(type)}</option>` : ""}${options}</select></label>`,
    ok:{label:"Add",callback:(event,button) => new FormData(button.form).get("entry")},
    rejectClose:false
  });
  if (selection == null) return null;
  if (allowCustom && selection === "custom") return {name:`New ${titleCase(type)}`,type};
  const entry = entries.find(entry=>String(entry.index) === selection);
  if (!entry) return null;
  if (context && !meetsPickerPrerequisites(entry,catalogRequirementContext(actor))) {
    ui.notifications.warn("The trainer no longer meets this entry’s prerequisites.");
    return null;
  }
  return catalogItemData(entry);
}

const pendingAbilityChoices = new WeakSet();

async function chooseSpeciesAbility(actor) {
  if (pendingAbilityChoices.has(actor)) return;
  pendingAbilityChoices.add(actor);
  try {
    const profile = (await dexProfiles()).get(actor.system.dexPage);
    if (!profile || normalizeRequirement(profile.name) !== normalizeRequirement(actor.system.species || "")) {
      return ui.notifications.warn("Select a species from the Pokédex first.");
    }
    const owned = new Set(actor.items.filter(isAbilityItem).map(item=>normalizeAbilityName(item.name)));
    const entries = speciesAbilityNames(profile).map(normalizeAbilityName)
      .filter(name=>!owned.has(name)).map(name=>abilitiesByName.get(name)).filter(Boolean);
    if (!entries.length) return ui.notifications.warn("There are no remaining abilities on this species list.");
    const choice = await DialogV2.prompt({classes:["pte-dialog"],window:{title:`${profile.name} · Choose Ability`},
      content:`<label>Ability <select name="ability">${entries.map((entry,index)=>
        `<option value="${index}">${escape(entry.name)}</option>`).join("")}</select></label>`,
      ok:{label:"Add Ability",callback:(event,button)=>new FormData(button.form).get("ability")},rejectClose:false});
    if (choice == null || !entries[Number(choice)]) return;
    const data = catalogItemData(entries[Number(choice)]);
    if (!await allowCatalogAcquisition(actor,data)) return;
    const [item] = await actor.createEmbeddedDocuments("Item",[data]);
    item?.sheet.render({force:true});
  } finally {
    pendingAbilityChoices.delete(actor);
  }
}


function itemDescription(item, listing = catalogListing(item)) {
  const description = item.system.description;
  const legacyRole = listing?.category === roleCategory && description?.startsWith("Primary role: choose two different eligible stats") &&
    description.endsWith("See the source page for the role’s effect.");
  if (!listing || (!legacyRole && description?.trim() && description !== linkedEffectPlaceholder &&
    description !== categoryEffectPlaceholder(listing))) return description;
  return catalogEffect(listing) || description;
}


const speciesMoves = new Map(attackCatalog.filter(entry=>entry.kind === "move" && entry.category === "Moves")
  .map(entry=>[normalizeRequirement(entry.name),entry]));

function startingMoveData(entry) {
  const available = [...new Set(entry.starting.map(normalizeMoveName))].map(name=>speciesMoves.get(name)).filter(Boolean);
  return available.map((move,index)=>{
    const data = catalogItemData(move);
    data.system.knownOnly = index >= 6;
    return data;
  });
}

async function learnSpeciesMove(actor, known = false) {
  if (!actor.isOwner || !pokemon(actor)) return;
  const profile = (await dexProfiles()).get(actor.system.dexPage);
  if (!profile || normalizeRequirement(profile.name) !== normalizeRequirement(actor.system.species || "")) {
    return ui.notifications.warn("Set the Pokémon’s species using the Pokédex first.");
  }
  const owned = new Set(actor.items.filter(item=>item.type === "move").map(item=>normalizeRequirement(item.name)));
  const eligible = [...speciesMoves.values()].filter(entry=>{
    if (owned.has(normalizeRequirement(entry.name))) return false;
    const requirement = speciesRequirement(entry,profile,actor.system.level);
    return !requirement.error && !requirement.review;
  });
  if (!eligible.length) return ui.notifications.info("There are no new starting or level-up moves available.");
  const choice = await DialogV2.prompt({classes:["pte-dialog"],window:{title:"Learn Species Move"},
    render:bindCatalogSearch,
    content:`${catalogSearchField}<label>Eligible move <select name="move" data-catalog-options>${eligible.map((move,index)=>`<option value="${index}">${escape(move.name)} · ${escape(move.stats.element)}</option>`).join("")}</select></label>`,
    ok:{label:"Learn",callback:(event,button)=>new FormData(button.form).get("move")},rejectClose:false});
  if (choice == null) return;
  const move = eligible[Number(choice)];
  if (!move || actor.system.dexPage !== profile.page || actor.items.some(item=>item.type === "move" && normalizeRequirement(item.name) === normalizeRequirement(move.name))) return;
  const current = speciesRequirement(move,profile,actor.system.level);
  if (current.error || current.review) return ui.notifications.warn("The Pokémon is no longer eligible for that move.");
  const data = catalogItemData(move);
  data.system.knownOnly = known || battleSlotsUsed(actor) >= actor.system.battleMoveLimit;
  await actor.createEmbeddedDocuments("Item",[data]);
}

const pendingGear = new Set();

function recoveryListing(item) {
  if (item?.type !== "gear") return null;
  const listing = catalogListing(item);
  return listing && Object.hasOwn(recoveryGear,listing.name) ? recoveryGear[listing.name] : null;
}

function boostListing(item) {
  if (item?.type !== "gear") return null;
  const listing = catalogListing(item);
  return listing && Object.hasOwn(boostGear,listing.name) ? boostGear[listing.name] : null;
}

function maladyListing(item) {
  if (item?.type !== "gear") return null;
  const name = catalogListing(item)?.name;
  return Object.hasOwn(maladyGear,name) ? maladyGear[name] : null;
}

const pokeballListing = item => item?.type === "gear" && catalogListing(item)?.name === "Pokeball";

async function capturePokemon(actor,item) {
  const trainer = pokemon(actor) ? linkedTrainer(actor) : actor;
  const targets = [...game.user.targets].filter(token=>token.actor);
  if (!trainer?.isOwner) return ui.notifications.warn("An owner of the receiving Trainer or the GM must handle the capture.");
  if (targets.length !== 1 || !pokemon(targets[0].actor)) return ui.notifications.warn("Target one wild Pokémon token.");
  const target = targets[0].actor;
  // Importing a successful capture into the team requires edit access to its Actor.
  if (!target.isOwner) return ui.notifications.warn("Ask the GM to resolve the capture on this target.");
  if (target.system.trainerId) return ui.notifications.warn("This Pokémon already belongs to a Trainer.");
  if (target.isToken && !game.user.can("ACTOR_CREATE")) {
    return ui.notifications.warn("Ask the GM to add this wild token to the Trainer’s team.");
  }
  const locks = [item.uuid,target.uuid];
  if (locks.some(id=>pendingGear.has(id))) return;
  locks.forEach(id=>pendingGear.add(id));
  try {
    const fainted = target.system.health.value <= 0;
    const accepted = await DialogV2.confirm({classes:["pte-dialog"],window:{title:"Use Poké Ball"},
      content:`<p>Spend one Poké Ball to capture ${escape(target.name)} for ${escape(trainer.name)} as an Extended action at the conclusion of the scene.</p>
      <p>${fainted ? "Confirm the battle has ended and the target is unconscious." : "Confirm the scene is resolved and this wild Pokémon willingly joins."}</p>`,
      yes:{label:"Confirm Capture"},rejectClose:false});
    if (!accepted || !actor.items.has(item.id) || item.system.quantity < 1 || target.system.trainerId ||
      !target.isOwner || !trainer.isOwner || (target.system.health.value <= 0) !== fainted) return;
    const quantity = item.system.quantity;
    await item.update({"system.quantity":quantity - 1});
    let capturedActor;
    try {
      if (target.isToken) {
        const data = target.toObject();
        delete data._id;
        delete data.folder;
        data.system.trainerId = trainer.id;
        data.ownership = foundry.utils.deepClone(trainer.ownership);
        data.prototypeToken = {...data.prototypeToken,actorLink:true};
        capturedActor = await Actor.create(data);
        if (!capturedActor) throw new Error("Could not create the captured Pokémon actor.");
      }
      const updates = {"system.trainerId":trainer.id};
      if (!target.isToken && game.user.isGM) {
        const ownership = {...target.ownership};
        for (const [user,level] of Object.entries(trainer.ownership)) {
          if (user !== "default" && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) ownership[user] = level;
        }
        updates.ownership = ownership;
      }
      await target.update(updates);
    } catch (error) {
      const rollback = [];
      if (capturedActor) rollback.push(capturedActor.delete());
      if (item.system.quantity === quantity - 1) rollback.push(item.update({"system.quantity":quantity}));
      await Promise.allSettled(rollback);
      throw error;
    }
    return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),
      content:`<p><strong>Capture</strong> · ${escape(target.name)} joins ${escape(trainer.name)}. One Poké Ball spent. Set starting Bond and active party placement at the table.</p>`});
  } finally {
    locks.forEach(id=>pendingGear.delete(id));
  }
}

function teamItemRecipients(actor, selected) {
  const trainer = pokemon(actor) ? linkedTrainer(actor) : actor;
  const team = trainer ? [trainer,...game.actors.filter(other=>pokemon(other) && other.system.trainerId === trainer.id)] : [];
  return [...new Map([actor,...team,...selected].filter(recipient=>recipient.isOwner)
    .map(recipient=>[recipient.uuid,recipient])).values()];
}

async function selectItemRecipient(actor,item,selected) {
  const recipients = teamItemRecipients(actor,selected);
  const preferred = selected[0]?.isOwner ? selected[0] : actor;
  const id = await DialogV2.prompt({classes:["pte-dialog"],window:{title:`Use ${item.name} On…`},
    content:`<label>Recipient <select name="target">${recipients.map((recipient,index)=>
      `<option value="${index}" ${recipient === preferred ? "selected" : ""}>${escape(recipient.name)}${recipient === actor ? " (self)" : ""}</option>`).join("")}</select></label>`,
    ok:{label:"Continue",callback:(event,button)=>new FormData(button.form).get("target")},rejectClose:false});
  return id == null ? null : recipients[Number(id)];
}

const weaponAttackEntries = attackCatalog.filter(entry=>entry.category === "Weapon Attacks");

async function createWeapon(actor, existing = null) {
  if (!actor?.isOwner || pendingGear.has(actor.uuid)) return;
  pendingGear.add(actor.uuid);
  try {
    const original = existing?.system.description || "";
    const [qualityLabel,typeLabel,rangeLabel,sizeLabel] = original.split("\n")[0].split(" · ");
    const {quality:oldQuality = qualityLabel,type:oldType = typeLabel,range:oldRange = rangeLabel,
      size:oldSize = sizeLabel,keywords:oldKeywords = /^Keywords: (.+?)\.?$/m.exec(original)?.[1].split(", ") || []} =
      existing?.getFlag(ID,"weaponBuild") ?? weaponPresets.get(existing?.getFlag(ID,"weaponPreset"))?.gear.flags[ID].weaponBuild ?? {};
    const oldNotes = existing?.getFlag(ID,"weaponNotes") ?? original.split("\n").slice(2)
      .filter(line=>!/^(Keywords:|Grants:|Cannot target adjacent|Resolve keyword|Weapon construction)/.test(line)).join("\n").trim();
    const oldSkill = existing ? skills[Number(existing.system.weaponSkill.slice(1))] : "";
    const linked = existing ? actor.items.filter(item=>item.type === "move" && item.system.weaponId === existing.id) : [];
    const options = (values,current)=>values.map(value=>`<option ${value === current ? "selected" : ""}>${escape(value)}</option>`).join("");
    const form = await DialogV2.prompt({classes:["pte-dialog"],window:{title:existing ? "Edit Weapon" : "Create Weapon"},
      content:`<label>Name <input name="name" value="${escape(existing?.name)}" required maxlength="100"></label>
        <label>Quality <select name="quality">${options(Object.keys(weaponQualities),oldQuality)}</select></label>
        <label>Type <select name="type">${options(["Martial","Arcane"],oldType)}</select></label>
        <label>Range <select name="range">${options(["Melee","Short Ranged","Long Ranged"],oldRange)}</select></label>
        <label>Size <select name="size">${options(["Medium","Large"],existing?.system.slotSize || oldSize)}</select></label>
        <label>Qualifying skill <select name="skill"><option value="">Default for weapon type</option>${options(skills,oldSkill)}</select></label>
        <p>PTE Rule Book, pp. 220–223. Confirm how the weapon was acquired with your GM.</p>`,
      ok:{label:"Choose Keywords",callback:(event,button)=>new FormData(button.form)},rejectClose:false});
    if (!form) return;
    const name = String(form.get("name") || "").trim();
    const qualityName = form.get("quality");
    const quality = weaponQualities[qualityName];
    const weapon = {type:form.get("type"),range:form.get("range"),size:form.get("size"),keywords:[]};
    const skill = form.get("skill") || (weapon.type === "Martial" ? "Combat" : "Occult Education");
    const skillIndex = skills.indexOf(skill);
    if (!name || !quality || !Object.hasOwn(quality,weapon.size) || skillIndex < 0) return;
    const allowed = Object.keys(weaponKeywords).filter(key=>weaponKeywords[key](weapon));
    const selections = await DialogV2.prompt({classes:["pte-dialog"],window:{title:"Weapon Keywords"},
      content:`<p>Choose up to ${quality.keywords} keywords. Cursed does not count toward the limit.</p>
        <div style="max-height:40vh;overflow:auto">${allowed.map(key=>`<label><input type="checkbox" name="keyword" value="${key}" ${oldKeywords.includes(key) ? "checked" : ""}> ${key}</label>`).join("")}</div>
        <label>Blessed or Elemental type choices, Defensive mode, curse, and other keyword details <textarea name="notes">${escape(oldNotes)}</textarea></label>`,
      ok:{label:"Choose Attacks",callback:(event,button)=>new FormData(button.form)},rejectClose:false});
    if (!selections) return;
    weapon.keywords = [...new Set(selections.getAll("keyword"))];
    const notes = String(selections.get("notes") || "").trim();
    if (weapon.keywords.some(key=>!allowed.includes(key)) || weapon.keywords.filter(key=>key !== "Cursed").length > quality.keywords) {
      return ui.notifications.warn("Choose keywords within the weapon’s limits.");
    }
    if (!notes && weapon.keywords.some(key=>["Blessed","Elemental","Defensive","Cursed"].includes(key))) {
      return ui.notifications.warn("Record the keyword’s required choices or details.");
    }
    const limits = quality[weapon.size];
    const attacks = weaponAttackEntries.filter(entry=>limits[weaponTiers.indexOf(entry.tier)] && eligibleWeaponAttack(weapon,entry));
    const picked = await DialogV2.prompt({classes:["pte-dialog"],window:{title:"Weapon Attacks"},
      content:`<p>Choose up to ${limits[0]} Novice, ${limits[1]} Advanced, and ${limits[2]} Master attacks.</p>
        <div style="max-height:54vh;overflow:auto">${attacks.map((entry,index)=>
          `<label><input type="checkbox" name="attack" value="${index}" ${linked.some(move=>move.system.source === entry.source) ? "checked" : ""}> ${escape(entry.name)} · ${entry.tier === "Basic Weapon" ? "Novice" : escape(entry.tier)}</label>`).join("")}</div>`,
      ok:{label:existing ? "Save Weapon" : "Create Weapon",callback:(event,button)=>new FormData(button.form).getAll("attack")},rejectClose:false});
    if (!picked) return;
    const selected = [...new Set(picked)].map(index=>attacks[Number(index)]);
    if (selected.some(entry=>!entry) || weaponTiers.some((tier,index)=>selected.filter(entry=>entry.tier === tier).length > limits[index])) {
      return ui.notifications.warn("The selected attacks exceed this weapon’s limits.");
    }
    const id = existing?.id ?? foundry.utils.randomID();
    const price = formatMoney(quality.price / (weapon.size === "Medium" ? 2 : 1));
    const description = [`${qualityName} · ${weapon.type} · ${weapon.range} · ${weapon.size}`,
      quality.rank ? `Qualifying skill: ${skill}, ${ranks[quality.rank-1]} or higher.` : "No qualifying rank required.",
      weapon.keywords.length ? `Keywords: ${weapon.keywords.join(", ")}` : "",notes,
      selected.length ? `Grants: ${selected.map(entry=>entry.name).join(", ")}` : "",
      weapon.range === "Long Ranged" ? "Cannot target adjacent enemies." : "",
      "Resolve keyword options and special effects at the table. PTE Rule Book, pp. 220–223."].filter(Boolean).join("\n");
    const unchangedPrice = existing && oldQuality === qualityName && oldSize === weapon.size;
    const system = {price:unchangedPrice ? existing.system.price : price,description,
      source:existing?.system.source || "PTE Rule Book, p. 220",slotSize:"",
      slotKeywords:`${weapon.size}, Equipment - Weapon`,weaponSkill:`s${skillIndex}`,weaponRank:quality.rank,weaponRange:weapon.range};
    const moves = selected.map(entry=>{
      const data = catalogItemData(entry);
      return {...data,name:`${entry.name} (${name})`,
        system:{...weaponAttackStats(weapon,data.system),weaponId:id,slotExempt:true}};
    });
    const flags = {[ID]:{weaponNotes:notes,weaponBuild:{quality:qualityName,...weapon}}};
    if (!existing) {
      return await actor.createEmbeddedDocuments("Item",[{_id:id,name,type:"gear",system,flags},...moves],{keepId:true});
    }
    if (!actor.items.has(id)) return;
    if (existing.system.equipped && actor.system.skills[system.weaponSkill] < quality.rank) {
      return ui.notifications.warn("Unequip the weapon before saving a build above your qualifying skill rank.");
    }
    const saved = await existing.update({name,system,flags});
    if (!saved) return;
    const kept = new Set();
    const updates = [];
    const additions = [];
    const mechanicsChanged = oldType !== weapon.type || oldRange !== weapon.range ||
      oldKeywords.includes("Extended") !== weapon.keywords.includes("Extended") ||
      oldKeywords.includes("Sharp") !== weapon.keywords.includes("Sharp");
    for (const move of moves) {
      const old = linked.find(item=>item.system.source === move.system.source);
      if (!old) additions.push(move);
      else {
        kept.add(old.id);
        updates.push({_id:old.id,name:move.name,...(mechanicsChanged ? {
          system:Object.fromEntries(["category","range","db","crit"].filter(key=>key === "crit" || move.system[key] !== undefined)
            .map(key=>[key,move.system[key] ?? 20]))
        } : {})});
      }
    }
    if (additions.length) await actor.createEmbeddedDocuments("Item",additions);
    if (updates.length) await actor.updateEmbeddedDocuments("Item",updates);
    const removed = linked.filter(item=>!kept.has(item.id)).map(item=>item.id);
    if (removed.length) await actor.deleteEmbeddedDocuments("Item",removed);
  } finally {
    pendingGear.delete(actor.uuid);
  }
}

const actorGear = actor=>actor.items.filter(item=>item.type === "gear").map(item=>item.toObject());
function proposedSlots(actor,item,changes) {
  const gear = actorGear(actor).filter(row=>!item.id || row._id !== item.id);
  gear.push({...item.toObject(),system:{...item.system.toObject(),...changes}});
  return slotTotals(gear,pokemon(actor));
}

async function changeGearLocation(actor,item,changes,swift = false) {
  const after = proposedSlots(actor,item,changes);
  const before = slotTotals(actorGear(actor),pokemon(actor));
  const error = after.problems.find(problem=>!before.problems.includes(problem));
  if (error || (after.inventory > before.inventory && after.inventory > after.inventoryMax) ||
    (after.equipment > before.equipment && after.equipment > after.equipmentMax)) {
    return ui.notifications.warn(error || "This change exceeds the available slots.");
  }
  const pool = actionPool(actor);
  const track = swift && game.combat?.started && game.combat.combatants.some(combatant=>combatant.actor?.uuid === actor.uuid);
  if (track) {
    const error = maneuverCostError(pool,["swift"]);
    if (error) return ui.notifications.warn(error);
    await pool.owner.update(maneuverActionUpdates(pool,["swift"],true));
  }
  try {
    const result = await item.update({system:changes});
    if (!result && track) await pool.owner.update(maneuverActionUpdates(pool,["swift"],false));
    return result;
  } catch (error) {
    if (track) await pool.owner.update(maneuverActionUpdates(pool,["swift"],false));
    throw error;
  }
}

async function useGear(actor,id) {
  const item = actor.items.get(id);
  const gear = recoveryListing(item);
  const boost = boostListing(item);
  const malady = maladyListing(item);
  if (!actor.isOwner || item?.type !== "gear" || item.system.quantity < 1 || item.system.inStorage || item.system.impaired ||
    (pokemon(actor) && !itemKeywords(item).has("pokemon"))) return;
  if (pokeballListing(item)) return capturePokemon(actor,item);
  if (!gear && !boost && !malady) return;
  if ((boost || malady) && !Object.hasOwn(boost || malady,item.system.variant)) return ui.notifications.warn("Choose a variant on the potion’s item sheet first.");
  const selected = [...game.user.targets].map(token => token.actor).filter(Boolean);
  if (malady && selected.length > 1) return ui.notifications.warn("Select one target to throw the potion.");
  if (malady && !selected.length) return ui.notifications.warn("Target a token to throw a Malady Potion.");
  const target = malady ? selected[0] : await selectItemRecipient(actor,item,selected);
  if (!target) return;
  if (!target.isOwner) return ui.notifications.warn("The GM or an owner of both actors must apply this item.");
  const pool = malady ? actionPool(actor) : null;
  const lock = [item.uuid,target.uuid,...(pool ? [pool.owner.uuid] : [])];
  if (lock.some(key => pendingGear.has(key))) return;
  lock.forEach(key => pendingGear.add(key));
  try {
    const afflictionOptions = Object.entries(afflictions).filter(([key])=>afflicted(target,key))
      .map(([key,label])=>`<label><input type="checkbox" name="cure" value="${key}"> ${label}</label>`).join("");
    const variant = item.system.variant;
    const form = malady ? await DialogV2.prompt({classes:["pte-dialog"],
      window:{title:`Throw ${item.name}`},
      content:`<p>${escape(target.name)} · ${afflictions[variant]}. Standard action, AC 4, range ${4 + actor.system.skills.s1} m. Confirm the target is in range.</p>
        <label><input type="checkbox" name="manualAction"> Action handled manually</label>
        <label>Throw result <select name="result" required><option value="roll">Roll against Speed Evasion</option><option value="adjacent">Adjacent · Sureshot</option><option value="hit">Manual Hit</option><option value="miss">Manual Miss</option></select></label>
        ${variant === "entranced" ? "<p>Record the fixation in the target’s affliction notes.</p>" : ""}`,
      ok:{label:"Throw",callback:(event,button)=>new FormData(button.form)},rejectClose:false
    }) : boost ? await DialogV2.confirm({classes:["pte-dialog"],window:{title:`Use ${item.name}`},
      content:`<p>${escape(target.name)} · ${escape(potionVariants[variant])}. Confirm the action cost and legal range at the table.</p>`,
      yes:{label:"Use One"},rejectClose:false}) : await DialogV2.prompt({classes:["pte-dialog"],
      window:{title:`Use ${item.name}`},
      content:`<p>Target · ${escape(target.name)}. Confirm the action cost and legal range at the table.${gear.revive ? "" : " Poultices require an adjacent target."}</p>
        <label>Effect <select name="mode"><option value="heal">Restore HP</option>
          ${gear.revive ? '<option value="revive">Revive</option>' : ""}
          <option value="cure">Cure afflictions (up to ${gear.cure})</option></select></label>
        ${afflictionOptions ? `<fieldset><legend>Afflictions to cure</legend>${afflictionOptions}</fieldset>` : ""}`,
      ok:{label:"Use One",callback:(event,button)=>new FormData(button.form)},
      rejectClose:false
    });
    if (!form || !actor.items.has(id) || item.system.quantity < 1 || item.system.inStorage || item.system.impaired || !target.isOwner) return;
    if ((boost || malady) && item.system.variant !== variant) return ui.notifications.warn("The potion variant changed. Reopen the use dialog.");
    const result = malady ? form.get("result") : null;
    if (malady && !["roll","adjacent","hit","miss"].includes(result)) return;
    const trackAction = malady && !form.has("manualAction");
    const actionPath = trackAction ? `system.${pool.key}.standard` : null;
    if (trackAction && !pool.owner.isOwner) return ui.notifications.warn("Only a Trainer owner or the GM can spend this action.");
    if (trackAction && pool.owner.system[pool.key].standard) return ui.notifications.warn("The Standard action is already spent.");
    const throwRoll = result === "roll" ?
      await new Roll("1d20 + @accuracy",{accuracy:accuracyModifier(actor)}).evaluate() : null;
    const throwDC = throwRoll ? 4 + attackEvasion(target,0) : null;
    const hit = throwRoll ? throwRoll.total >= throwDC : result === "hit" || result === "adjacent";
    const plan = malady ? maladyPlan(target.system,malady,variant,elements(target),hit) :
      boost ? boostPlan(target.system,boost,variant,effectiveStage(target,variant)) : recoveryPlan(target.system,gear,form.get("mode"),form.getAll("cure"));
    if (plan.error) return ui.notifications.warn(plan.error);
    const quantity = item.system.quantity;
    let actionSpent = false;
    let itemSpent = false;
    try {
      if (trackAction) {
        if (pool.owner.system[pool.key].standard) return ui.notifications.warn("The Standard action is already spent.");
        await pool.owner.update({[actionPath]:true});
        actionSpent = true;
      }
      await item.update({"system.quantity":quantity - 1});
      itemSpent = true;
      if (plan.updates) await target.update({...plan.updates,...(gear?.revive ? {"system.healingPotionUsed":true} : {})});
    } catch (error) {
      const rollback = [];
      if (itemSpent && actor.items.has(id) && item.system.quantity === quantity - 1) rollback.push(item.update({"system.quantity":quantity}));
      if (actionSpent && pool.owner.system[pool.key].standard) rollback.push(pool.owner.update({[actionPath]:false}));
      await Promise.allSettled(rollback);
      throw error;
    }
    const summary = `<p><strong>${escape(item.name)}</strong> · ${escape(target.name)} ${escape(plan.message)}.${actionSpent ? " Standard action spent." : ""}</p>`;
    const speaker = ChatMessage.getSpeaker({actor});
    if (throwRoll) {
      await throwRoll.toMessage({speaker,flavor:`Throw · TN ${throwDC} · ${hit ? "Hit" : "Miss"}${summary}`});
    } else {
      await ChatMessage.create({speaker,content:result === "adjacent" ? `<p>Throw · Sureshot</p>${summary}` : summary});
    }
  } finally {
    lock.forEach(key => pendingGear.delete(key));
  }
}

const trainerProgressionLocks = new Set();

async function advanceTrainer(actor) {
  if (!actor.isOwner || actor.type !== "trainer" || trainerProgressionLocks.has(actor.uuid)) return;
  trainerProgressionLocks.add(actor.uuid);
  try {
    const {system} = actor;
    const next = system.level + 1;
    if (next > 20) return ui.notifications.warn("This Trainer is already at level 20.");
    const goal = system.meritGoal || trainerMeritGoal(system.level);
    if (system.merits < goal) return ui.notifications.warn("Reach the Merit goal before leveling up.");
    const milestone = [5,10,15].includes(next);
    const skillOptions = skills.map((name,index)=>{
      const key = `s${index}`;
      return `<option value="${key}">${escape(name)} · ${system.skills[key]}d6</option>`;
    });
    const milestoneOptions = skillOptions.filter((option,index)=>system.skills[`s${index}`] <= (next === 5 ? 3 : 4));
    const form = await DialogV2.prompt({classes:["pte-dialog"],window:{title:`Trainer Level ${next}`},
      content:`<p>Gain ${next === 5 || next === 15 ? 15 : 5} stat points and increase the Pokémon level cap to ${pokemonLevelCap(next)}. Choose one Class or General Feature from your Profile after leveling.</p>
        <label>Rank up a skill or gain a Talent <select name="skill"><option value="talent">Choose a Talent after leveling</option>${skillOptions.join("")}</select></label>
        ${milestone ? `<p>Choose Skill Specialty, or select two different eligible skills below.</p>
          <label>First milestone skill <select name="first"><option value="">Skill Specialty</option>${milestoneOptions.join("")}</select></label>
          <label>Second milestone skill <select name="second"><option value="">Skill Specialty</option>${milestoneOptions.join("")}</select></label>` : ""}`,
      ok:{label:"Level Up",callback:(event,button)=>new FormData(button.form)},rejectClose:false});
    if (!form || actor.system.level !== next - 1) return;
    const plan = trainerLevelPlan(actor.system,{skill:form.get("skill"),
      milestoneSkills:[form.get("first"),form.get("second")].filter(Boolean)});
    if (plan.error) return ui.notifications.warn(plan.error);
    return actor.update(plan.updates);
  } finally {
    trainerProgressionLocks.delete(actor.uuid);
  }
}

async function startTrainerProgression(actor) {
  if (!actor.isOwner || actor.type !== "trainer" || actor.system.level !== 1 ||
    actor.system.startingProgression || trainerProgressionLocks.has(actor.uuid)) return;
  trainerProgressionLocks.add(actor.uuid);
  try {
    const options = skills.map((name,index)=>`<option value="s${index}">${escape(name)}</option>`).join("");
    const startingRanks = [4,3,3,3,1,1,1];
    const form = await DialogV2.prompt({classes:["pte-dialog"],window:{title:"Level 1 Trainer Setup"},
      content:`<p>Choose seven different skills. This sets the starting skill ranks and adds 10 stat points. Use it before assigning starting ranks or spending points manually.</p>
        <div style="max-height:55vh;overflow:auto">${startingRanks.map((rank,index)=>
          `<label>${ranks[rank-1]} <select name="skill${index}" required><option value="">Select skill</option>${options}</select></label>`).join("")}</div>`,
      ok:{label:"Apply Starting Benefits",callback:(event,button)=>new FormData(button.form)},rejectClose:false});
    if (!form || actor.system.level !== 1 || actor.system.startingProgression) return;
    const system = actor.system;
    if (Object.values(system.skills).some(rank=>rank !== 2) ||
      Object.entries(system.stats).some(([key,value])=>value !== (key === "hp" ? 10 : 5))) {
      return ui.notifications.warn("This Trainer already has customized starting stats or skills. Use the existing sheet controls to finish setup.");
    }
    const selected = startingRanks.map((_,index)=>form.get(`skill${index}`));
    if (new Set(selected).size !== startingRanks.length || selected.some(key=>!Object.hasOwn(system.skills,key))) {
      return ui.notifications.warn("Choose seven different skills.");
    }
    return actor.update({"system.startingProgression":true,"system.levelPoints":system.levelPoints + 10,
      "system.progressionHistory":"Level 1 · Choose four Features and two Talents.",
      ...Object.fromEntries(selected.map((key,index)=>[`system.skills.${key}`,startingRanks[index]]))});
  } finally {
    trainerProgressionLocks.delete(actor.uuid);
  }
}

const pokemonProgressionLocks = new Set();
const pokemonHistory = (actor,line) =>
  [line,...actor.system.progressionHistory.split("\n").filter(Boolean)].slice(0,25).join("\n");

async function chooseProgressionOptions(title, choices, count) {
  const options = choices.map(({key,label})=>`<option value="${escape(key)}">${escape(label)}</option>`).join("");
  return DialogV2.prompt({classes:["pte-dialog"],window:{title},
    content:Array.from({length:count},(_,index)=>
      `<label>Choice ${index + 1}<select name="choice" required><option value="">Select</option>${options}</select></label>`).join(""),
    ok:{label:"Apply",callback:(event,button)=>new FormData(button.form).getAll("choice")},rejectClose:false});
}

async function pokemonReward(actor, reward) {
  if (!actor.isOwner || !pokemon(actor) || pokemonProgressionLocks.has(actor.uuid)) return;
  pokemonProgressionLocks.add(actor.uuid);
  try {
    await applyPokemonReward(actor,reward);
  } finally {
    pokemonProgressionLocks.delete(actor.uuid);
  }
}

async function applyPokemonReward(actor,reward) {
  const {system} = actor;
  const profile = system.dexPage ? (await dexProfiles()).get(system.dexPage) : null;
  if (profile && normalizeRequirement(profile.name) !== normalizeRequirement(system.species || "")) return;
  const train = reward === "trainedSkill1" || reward === "trainedSkill20";
  const tutorLevel = /^tutor(10|20|30|40|50)$/.exec(reward)?.[1];
  const level = train ? Number(reward.slice("trainedSkill".length)) : tutorLevel ? Number(tutorLevel) :
    ({role:1,stats40:40,stats50:50})[reward];
  if (!level || system.level < level || (train ? system[reward] : system.progressionClaims[reward])) return;
  const page = system.dexPage;
  const stillEligible = () => actor.isOwner && actor.system.level >= level && actor.system.dexPage === page &&
    !(train ? actor.system[reward] : actor.system.progressionClaims[reward]);
  if (train) {
    const highRank = profile?.skillRanks.match(/(?:Mastered|Proficient)\s*[:-]\s*(.*?)(?=\s+(?:Mastered|Proficient|Inept)\s*[:-]|$)/gi) ?? [];
    const highNames = new Set(highRank.flatMap(text=>text.replace(/^[^:-]+[:-]/,"").split(",").map(normalizeRequirement)));
    const eligible = skills.map((label,index)=>({label,key:`s${index}`})).filter(({key,label})=>
      level === 1 || key !== system.trainedSkill1 || (profile && !highNames.has(normalizeRequirement(label))));
    const picks = await chooseProgressionOptions(`Level ${level} · Train a Skill`,eligible,1);
    const key = picks?.[0];
    if (!stillEligible() || !eligible.some(option=>option.key === key)) return;
    return actor.update({[`system.${reward}`]:key,
      "system.progressionHistory":pokemonHistory(actor,`Level ${level} · Trained ${skills[Number(key.slice(1))]} (+2d6).`)});
  }
  if (tutorLevel) {
    const tiers = pokemonTutorTiers[level];
    const rows = profile?.tutor ?? [];
    if (rows.length !== 6 || !rows.every((row,index)=>(index % 2 ? /^Generic:/i : /^Unique:/i).test(row))) {
      return ui.notifications.warn("This Pokédex entry has no complete tier breakdown. Have the GM verify the tutor reward.");
    }
    const names = new Set(rows.flatMap((row,index)=>tiers.includes(Math.floor(index/2)+1) ?
      row.replace(/^(?:Unique|Generic):\s*/i,"").split(",").map(normalizeMoveName) : []));
    const hasMove = name => actor.items.some(item=>item.type === "move" && normalizeMoveName(item.name) === name);
    const eligible = [...speciesMoves].filter(([name])=>names.has(name) && !hasMove(name));
    if (!eligible.length) return ui.notifications.warn("No unlearned catalog moves match this tutor reward.");
    const picks = await chooseProgressionOptions(`Level ${level} · Tutor Attack`,eligible.map(([key,entry])=>({key,label:entry.name})),1);
    const entry = eligible.find(([name])=>name === picks?.[0] && !hasMove(name))?.[1];
    if (!entry || !stillEligible()) return;
    const data = catalogItemData(entry);
    data.system.knownOnly = battleSlotsUsed(actor) >= actor.system.battleMoveLimit;
    const [item] = await actor.createEmbeddedDocuments("Item",[data]);
    if (!item) return;
    try {
      await actor.update({[`system.progressionClaims.${reward}`]:true,
        "system.progressionHistory":pokemonHistory(actor,`Level ${level} · Learned ${entry.name} as a Tutor Attack.`)});
    } catch (error) {
      await item.delete();
      throw error;
    }
    return;
  }
  const role = reward === "role" ? actor.items.find(isRoleItem) : null;
  if (reward === "role" && !role) return ui.notifications.warn("Choose a primary Pokémon Role first.");
  if (level === 50 && (!profile || Object.values(profile.stats).reduce((sum,value)=>sum+value,0) > 45)) {
    return ui.notifications.warn("The level 50 stat bonus requires a Pokédex base stat total of 45 or less.");
  }
  const roleStats = role ? catalogListing(role).startingStats : "";
  const labels = roleStats && roleStats !== "Any 2 Different Stats" ?
    roleStats.split(/,\s*|\s+or\s+/) : Object.values(stats);
  const eligible = Object.entries(stats).filter(([,label])=>labels.includes(label)).map(([key,label])=>({key,label}));
  const picks = await chooseProgressionOptions(`Level ${level} · Choose Two Stats for +5 Each`,eligible,2);
  if (!picks || !stillEligible() || (role && actor.items.find(isRoleItem)?.id !== role.id)) return;
  const validPair = picks.every(key=>eligible.some(option=>option.key === key)) &&
    (roleStats !== "HP, Special Attack or Special Defense" || picks.includes("hp"));
  const updates = validPair && pokemonStatReward(actor.system,picks);
  if (!updates) return ui.notifications.warn("Choose two different eligible stats.");
  return actor.update({...updates,[`system.progressionClaims.${reward}`]:true,
    "system.progressionHistory":pokemonHistory(actor,`Level ${level} · +5 ${picks.map(key=>stats[key]).join(" and +5 ")}.`)});
}

async function evolvePokemon(actor) {
  if (!actor.isOwner || !pokemon(actor) || pokemonProgressionLocks.has(actor.uuid)) return;
  pokemonProgressionLocks.add(actor.uuid);
  try {
    const profiles = await dexProfiles();
    const source = profiles.get(actor.system.dexPage);
    if (!source || normalizeRequirement(source.name) !== normalizeRequirement(actor.system.species || "")) return;
    const candidates = evolutionOptions(source,profiles.values()).filter(choice=>actor.system.level >= choice.level);
    if (!candidates.length) return ui.notifications.warn("No level-based evolution is currently available from this profile. Check the Pokédex and consult the GM for other triggers.");
    const picks = await chooseProgressionOptions("Evolve Pokémon",candidates.map(({profile,level})=>
      ({key:String(profile.page),label:`${profile.name} · Level ${level}`})),1);
    const option = candidates.find(choice=>String(choice.profile.page) === picks?.[0]);
    if (!option || actor.system.dexPage !== source.page || actor.system.level < option.level) return;
    const next = option.profile;
    const art = await tokenArtwork(next.page);
    if (actor.system.dexPage !== source.page || actor.system.level < option.level) return;
    const evolved = pokemonEvolutionStats(actor.system,source,next);
    const updates = {
      "system.species":next.name,"system.dexPage":next.page,"system.type1":next.types[0] || "","system.type2":next.types[1] || "",
      "system.stats":evolved.stats,"system.health.value":evolved.hp,
      ...prototypeFootprintUpdates(pokemonTokenFootprint(next.profile)),
      "system.progressionHistory":pokemonHistory(actor,`Evolved from ${source.name} to ${next.name}. Review skill ranks, abilities, and any Evolution attack with the GM.`),
      ...tokenArtworkUpdates(art)
    };
    return actor.update(updates);
  } finally {
    pokemonProgressionLocks.delete(actor.uuid);
  }
}

async function levelPokemon(actor) {
  if (!actor.isOwner || !pokemon(actor)) return;
  const trainer = linkedTrainer(actor);
  if (!trainer) return ui.notifications.warn("Assign a Trainer before using guided progression.");
  const startingLevel = actor.system.level;
  const form = await DialogV2.prompt({classes:["pte-dialog"],window:{title:"Pokémon Progression"},
    content:`<p>Current level ${actor.system.level} · Trainer cap ${pokemonLevelCap(trainer.system.level)}</p>
      <label>Method <select name="method"><option value="milestone">Trainer leveled up · up to 5</option>
      <option value="training">Downtime Training · up to 20</option></select></label>
      <label>Levels gained <input type="number" name="gain" min="1" max="20" value="1" required></label>
      <p>Confirm eligibility with the GM. See Rule Book pp. 189–190 for move, role, and evolution milestones.</p>`,
    ok:{label:"Apply Levels",callback:(event,button)=>new FormData(button.form)},rejectClose:false});
  if (!form || actor.system.level !== startingLevel) return;
  const currentTrainer = linkedTrainer(actor);
  const plan = pokemonLevelPlan(actor.system.level,currentTrainer?.system.level,form.get("method"),Number(form.get("gain")));
  if (plan.error) return ui.notifications.warn(plan.error);
  const previous = actor.system.level;
  const milestones = [10,20,25,30,40,50,75,100].filter(level=>level > previous && level <= plan.level);
  const updates = {"system.level":plan.level,"system.levelPoints":actor.system.levelPoints+plan.points,
    "system.progressionHistory":pokemonHistory(actor,`Level ${previous} → ${plan.level} · +${plan.points} stat points.${milestones.length ? " Milestones reached: " + milestones.join(", ") + "." : ""}`)};
  if (actor.system.health.value > 0) updates["system.health.value"] = actor.system.health.value + plan.points;
  return actor.update(updates);
}

async function allocateStatPoints(actor) {
  if (!actor.isOwner || !actor.system.levelPoints) return;
  const fields = Object.entries(stats).map(([key,label])=>
    `<label>${label} <input name="${key}" type="number" min="0" value="0"></label>`).join("");
  const form = await DialogV2.prompt({classes:["pte-dialog"],window:{title:"Allocate Level-Up Stat Points"},
    content:`<p>${actor.system.levelPoints} unspent points. The limit uses allocations recorded by this tracker.</p>${fields}
      ${game.user.isGM ? '<label><input type="checkbox" name="override"> Allow a Glass Cannon exception</label>' : ""}`,
    ok:{label:"Allocate",callback:(event,button)=>new FormData(button.form)},rejectClose:false});
  if (!form) return;
  const allocation = Object.fromEntries(Object.keys(stats).map(key=>[key,Number(form.get(key))]));
  const plan = allocateLevelPoints(actor.system,allocation,game.user.isGM && form.has("override"));
  if (plan.error) return ui.notifications.warn(plan.error);
  return actor.update(plan.updates);
}

const walletLocks = new Set();
const formatMoney = value => `$${new Intl.NumberFormat().format(value)}`;

async function changeWallet(actor,mode) {
  if (!actor.isOwner || actor.type !== "trainer" || !["credit","debit"].includes(mode) || walletLocks.has(actor.uuid)) return;
  walletLocks.add(actor.uuid);
  const label = mode === "credit" ? "Add Money" : "Spend Money";
  try {
    const form = await DialogV2.prompt({classes:["pte-dialog"],window:{title:label},
      content:`<p>Balance · ${formatMoney(actor.system.money)}</p>
        <label>Amount <input name="amount" type="number" min="1" step="1" required></label>
        <label>Note (optional) <input name="note" maxlength="100"></label>`,
      ok:{label,callback:(event,button)=>new FormData(button.form)},rejectClose:false});
    if (!form || !actor.isOwner) return;
    const amount = Number(form.get("amount"));
    const result = walletBalance(actor.system.money,amount,mode);
    if (result.error) return ui.notifications.warn(result.error);
    const note = String(form.get("note") || "").replace(/\s+/g," ").trim().slice(0,100);
    const line = `${mode === "credit" ? "+" : "−"}${formatMoney(amount)}${note ? ` · ${note}` : ""} · Balance ${formatMoney(result.balance)}`;
    const history = [line,...(actor.system.walletHistory || "").split("\n").filter(Boolean)].slice(0,10);
    return await actor.update({"system.money":result.balance,"system.walletHistory":history.join("\n")});
  } finally {
    walletLocks.delete(actor.uuid);
  }
}

class PTESheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  activePanel = "profile";
  panelScroll = new Map();

  static DEFAULT_OPTIONS = {
    classes:["pte","pte-actor"], tag:"form", position:{width:760,height:815}, window:{resizable:true},
    form:{submitOnChange:true,closeOnSubmit:false},
    actions:{
      sheetPanel(event,target) {
        if (this.activePanel === target.dataset.panel) return;
        const body = target.closest(".pte-body");
        this.panelScroll.set(this.activePanel,body.scrollTop);
        this.activePanel = target.dataset.panel;
        for (const button of body.querySelectorAll("[data-action=sheetPanel]")) {
          button.setAttribute("aria-pressed",String(button.dataset.panel === this.activePanel));
        }
        for (const panel of body.querySelectorAll("[data-sheet-panel]")) {
          panel.hidden = panel.dataset.sheetPanel !== this.activePanel;
        }
        body.scrollTop = this.panelScroll.get(this.activePanel) ?? 0;
      },
      trainerArtwork(event,target) {
        const actor = this.document;
        const art = target.dataset.art;
        if (!this.isEditable || actor.type !== "trainer" || !["portrait","token"].includes(art)) return;
        const token = art === "token" ? actor.token : null;
        const document = token ?? actor;
        const property = art === "portrait" ? "img" : token ? "texture.src" : "prototypeToken.texture.src";
        const current = art === "portrait" ? actor.img : (token ?? actor.prototypeToken)?.texture.src;
        const FilePicker = foundry.applications.apps.FilePicker.implementation;
        return new FilePicker({type:"image",current,callback:path=>document.update({[property]:path})}).render({force:true});
      },
      wallet(event,target) { return changeWallet(this.document,target.dataset.mode); },
      evolvePokemon() { return evolvePokemon(this.document); },
      levelPokemon() { return levelPokemon(this.document); },
      pokemonReward(event,target) { return pokemonReward(this.document,target.dataset.reward); },
      allocateStatPoints() { return allocateStatPoints(this.document); },
      advanceTrainer() { return advanceTrainer(this.document); },
      startTrainerProgression() { return startTrainerProgression(this.document); },
      opposedSkill() { return multiSkillCheck(this.document,true); },
      groupSkill() { return multiSkillCheck(this.document,false); },
      skill(event, target) { return skill(this.document, Number(target.dataset.index)); },
      async save() {
        const actor = this.document;
        const penalty = capCombatModifier(potionBonus(actor,"save") - (afflicted(actor,"cursed") ? 3 : 0));
        const roll = await new Roll("1d20 + @penalty",{penalty}).evaluate();
        await roll.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor:"Affliction Save · 15+"});
        if (roll.total < 15 || !this.isEditable) return;
        const active = Object.entries(afflictions).filter(([key])=>afflicted(actor,key));
        if (!active.length) return;
        const condition = await DialogV2.prompt({classes:["pte-dialog"],window:{title:"Cure One Affliction"},
          content:`<label>Affliction <select name="affliction">${active.map(([key,label])=>`<option value="${key}">${label}</option>`).join("")}</select></label>`,
          ok:{label:"Cure",callback:(event,button)=>new FormData(button.form).get("affliction")},rejectClose:false});
        if (Object.hasOwn(afflictions,condition)) return actor.update({[`system.afflictions.${condition}`]:false});
      },
      async toggleAffliction(event,target) {
        const actor = this.document;
        const key = target.dataset.key;
        if (!this.isEditable || !Object.hasOwn(afflictions,key)) return;
        const immune = (afflictionImmunities[key] || []).some(type=>elements(actor).includes(type));
        if (immune && !afflicted(actor,key)) return ui.notifications.warn("This Pokémon’s type is immune to that affliction.");
        return actor.update({[`system.afflictions.${key}`]:!afflicted(actor,key)});
      },
      toggleCondition(event,target) {
        const actor = this.document;
        const key = target.dataset.key;
        if (!this.isEditable || !Object.hasOwn(conditions,key) || actor.system.health.value <= 0) return;
        if (grantedCondition(actor.system,key)) return;
        return actor.update({[`system.conditions.${key}`]:!actor.system.conditions[key]});
      },
      clearAfflictions() {
        const updates = Object.fromEntries(Object.keys(afflictions).map(key=>[`system.afflictions.${key}`,false]));
        return this.document.update(updates);
      },
      async endTurnTicks() {
        const actor = this.document;
        const active = actor.system.afflictions;
        if (!active.burned && !active.poisoned && !active.wounded) return;
        const form = await DialogV2.prompt({classes:["pte-dialog"],window:{title:"End-Turn Affliction Damage"},
          content:active.wounded ? '<label><input type="checkbox" name="moved"> Shifted more than half of movement</label>' : '<p>Apply active Burned and Poisoned HP loss.</p>',
          ok:{label:"Apply",callback:(event,button)=>new FormData(button.form)},rejectClose:false});
        if (!form) return;
        const loss = afflictionTickDamage(actor.system.health.max,active,form.has("moved"));
        return actor.update(combatDamageUpdate(actor.system,loss));
      },
      capability(event,target) { return useCapability(this.document,target.dataset.capability); },
      spirit(event,target) { return adjustSpirit(this.document,target.dataset.mode); },
      initiative(event,target) { return rollInitiative(this.document,target.dataset.party === "true"); },
      luck() { return new Roll("1d20").toMessage({speaker:ChatMessage.getSpeaker({actor:this.document}),flavor:"Luck Check"}); },
      maneuver(event,target) {
        const rules = target.closest("dt")?.nextElementSibling?.textContent.trim() || "";
        return useManeuver(this.document,target.dataset.maneuver,rules);
      },
      basicAttack() { return rollBasicAttack(this.document); },
      advanceAttackTurn() { return this.document.update({"system.attackTurn":this.document.system.attackTurn + 1}); },
      resetAttackScene() { return resetAttackScene(this.document); },
      manualRange() { return placeManualRange(); },
      deleteRangeOnMap() { return removeRangeOnMap(); },
      inspectRanges() { return inspectRangeTemplates(); },
      removeRange() { return removeLastRangeTemplate(); },
      moveRange(event,target) { return placeMoveRange(this.document.items.get(target.dataset.id)); },
      trackedMove(event,target) { return trackedMove(this.document,this.document.items.get(target.dataset.id)); },
      move(event,target) { return useMove(this.document,this.document.items.get(target.dataset.id)); },
      chooseAbility() {
        if (this.isEditable && pokemon(this.document)) return chooseSpeciesAbility(this.document);
      },
      open(event,target) { return this.document.items.get(target.dataset.id)?.sheet.render({force:true}); },
      async add(event,target) {
        const type = target.dataset.type;
        if (!this.isEditable || !Object.hasOwn(itemTypes,type)) return;
        if (type === "class" && pokemon(this.document)) return;
        const rolesOnly = target.dataset.roles === "true";
        if (rolesOnly && !pokemon(this.document)) return;
        if (pokemon(this.document) && type === "feature" && !rolesOnly) return;
        const featureGroup = type === "feature" && !pokemon(this.document)
          ? trainerFeatureGroups.find(group=>group.key === target.dataset.featureGroup) : null;
        const data = await pickCatalogEntry(type,rolesOnly,this.document,featureGroup);
        if (!data || !await allowCatalogAcquisition(this.document,data)) return;
        if (type === "move" && (target.dataset.known === "true" ||
          (pokemon(this.document) && battleSlotsUsed(this.document) >= this.document.system.battleMoveLimit))) {
          data.system = {...data.system,knownOnly:true};
        }
        const item = await createCatalogItem(this.document,data);
        item?.sheet.render({force:true});
      },
      toggleBattleMove(event,target) {
        const actor = this.document;
        const item = actor.items.get(target.dataset.id);
        if (!this.isEditable || item?.type !== "move") return;
        if (pokemon(actor) && item.system.knownOnly && !item.system.slotExempt && battleSlotsUsed(actor) >= actor.system.battleMoveLimit) {
          return ui.notifications.warn("The Battle Attack List is full.");
        }
        return item.update({"system.knownOnly":!item.system.knownOnly});
      },
      async remove(event,target) {
        const item = this.document.items.get(target.dataset.id);
        if (item && await DialogV2.confirm({classes:["pte-dialog"],window:{title:"Remove Item"},content:`<p>Remove ${escape(item.name)}?</p>`,rejectClose:false})) {
          const linked = item.type === "gear" ? this.document.items.filter(move=>move.type === "move" && move.system.weaponId === item.id) : [];
          await this.document.deleteEmbeddedDocuments("Item",[item.id,...linked.map(move=>move.id)]);
        }
      },
      createWeapon() { return createWeapon(this.document); },
      async raiseShield() {
        const actor = this.document;
        if (!actor.isOwner || !equippedGear(actor).some(item=>item.name === "Heavy Shield")) return;
        const pool = actionPool(actor);
        const cost = ["swift"];
        const error = maneuverCostError(pool,cost);
        if (error) return ui.notifications.warn(error);
        await pool.owner.update(maneuverActionUpdates(pool,cost,true));
        try {
          const protection = await protectWithShield(actor,actor);
          ui.notifications.info(`Heavy Shield grants ${protection} Damage Reduction until your next turn.`);
        } catch (error) {
          await pool.owner.update(maneuverActionUpdates(pool,cost,false));
          throw error;
        }
      },
      useGear(event,target) { return useGear(this.document,target.dataset.id); },
      storeGear(event,target) {
        const item = this.document.items.get(target.dataset.id);
        if (!this.isEditable || item?.type !== "gear") return;
        return changeGearLocation(this.document,item,{inStorage:!item.system.inStorage,equipped:false},item.system.equipped);
      },
      equip(event,target) {
        const item = this.document.items.get(target.dataset.id);
        if (item?.type !== "gear" || !this.isEditable || item.system.inStorage || item.system.quantity < 1) return;
        if (!item.system.equipped && !equipmentEligible(item,pokemon(this.document))) {
          return ui.notifications.warn("This item lacks an eligible Equipment keyword.");
        }
        if (!item.system.equipped && item.system.weaponRank > (this.document.system.skills[item.system.weaponSkill] ?? 0)) {
          return ui.notifications.warn("The holder does not meet this weapon’s qualifying skill rank.");
        }
        const minimum = equipmentProfile(item)?.level || 0;
        if (!item.system.equipped && this.document.system.level < minimum) {
          return ui.notifications.warn(`This equipment requires level ${minimum}.`);
        }
        return changeGearLocation(this.document,item,{equipped:!item.system.equipped},true);
      },
      async spendAction(event,target) {
        const {owner:pool,key:name} = actionPool(this.document,target.dataset.pool);
        if (!pool.isOwner) return ui.notifications.warn("Only a Trainer owner or the GM can change this action pool.");
        const path = `system.${name}.${target.dataset.key}`;
        await pool.update({[path]:!pool.system[name][target.dataset.key]});
      },
      async refreshActions(event,target) {
        const {owner:pool,key:name} = actionPool(this.document,target.dataset.pool);
        if (!pool.isOwner) return;
        await pool.update(Object.fromEntries(actions.map(key => [`system.${name}.${key}`,false])));
      },
      resetStages() {
        const {stages,defaultStages} = this.document.system;
        return this.document.update(Object.fromEntries(Object.keys(stages).map(key => [`system.stages.${key}`,defaultStages[key]])));
      },
      async rest() {
        const actor = this.document;
        if (!this.isEditable) return;
        const mode = await DialogV2.prompt({classes:["pte-dialog"],window:{title:"Rest & Recovery"},
          content:`<label>Recovery <select name="mode">
            <option value="half">Scene break, nap, or interrupted sleep · half max HP</option>
            <option value="full">Full night's rest or medical treatment · full HP</option>
            <option value="revive">GM-approved fainting recovery · 1 HP</option>
          </select></label><p>Confirm the required time or assistance at the table. See Rule Book p. 184.</p>`,
          ok:{label:"Recover",callback:(event,button)=>new FormData(button.form).get("mode")},rejectClose:false});
        if (!mode) return;
        const plan = restPlan(actor.system,mode);
        if (plan.error) return ui.notifications.warn(plan.error);
        return actor.update({"system.health.value":plan.value});
      },
      async damage() {
        const amount = await DialogV2.prompt({classes:["pte-dialog"],window:{title:"Apply Final Damage"},content:'<label>Damage <input name="amount" type="number" min="0" required></label>',
          ok:{label:"Apply",callback:(event,button) => Number(new FormData(button.form).get("amount"))},rejectClose:false});
        if (!(amount > 0)) return;
        return this.document.update(combatDamageUpdate(this.document.system,amount));
      },
      books() { return showBooks(); },
      speciesTokenSize() { return applySpeciesTokenSize(this.document); },
      speciesArtwork() { return applySpeciesArtwork(this.document); },
      learnSpeciesMove(event,target) { return learnSpeciesMove(this.document,target.dataset.known === "true"); },
      profile() { return showProfile(this.document.system.dexPage); },
      dex() { return new Dex({destination:this.document}).render({force:true}); },
      async openPartner(event,target) { return game.actors.get(target.dataset.id)?.sheet.render({force:true}); }
    }
  };
  static PARTS = {body:{template:`${root}/templates/actor.hbs`,scrollable:[""]}};
  _onRender(context,options) {
    super._onRender(context,options);
    for (const input of this.element.querySelectorAll("[data-item-query]")) {
      if (input.dataset.searchBound) continue;
      input.dataset.searchBound = "true";
      input.addEventListener("input",()=>{
        const query = normalizeRequirement(input.value);
        for (const row of input.closest("section").querySelectorAll("[data-item-search]")) {
          row.hidden = !normalizeRequirement(row.dataset.itemSearch).includes(query);
        }
      });
    }
  }

  async _onDropItem(event, item) {
    const actor = this.document;
    if (pokemon(actor) && (item.type === "class" ||
      (item.type === "feature" && !pokemonCatalogFeature(catalogListing(item))))) {
      ui.notifications.warn("Use Pokémon Roles and Abilities on Pokémon sheets.");
      return null;
    }
    const preset = item.pack === `${ID}.gear` && weaponPresets.get(item.getFlag(ID,"weaponPreset"));
    if (preset) {
      if (!this.isEditable || pendingGear.has(actor.uuid)) return null;
      if (pokemon(actor)) return ui.notifications.warn("These Trainer weapons lack the Pokémon equipment keyword.");
      pendingGear.add(actor.uuid);
      try {
        const id = foundry.utils.randomID();
        const [gear] = await actor.createEmbeddedDocuments("Item",[{...preset.gear,_id:id}],{keepId:true});
        if (!gear) return null;
        try {
          const moves = await actor.createEmbeddedDocuments("Item",preset.moves.map(move=>
            ({...move,system:{...move.system,weaponId:gear.id}})));
          if (moves.length !== preset.moves.length) throw Error("Some weapon attacks could not be added.");
        } catch (error) {
          const added = actor.items.filter(move=>move.type === "move" && move.system.weaponId === gear.id);
          await actor.deleteEmbeddedDocuments("Item",[gear.id,...added.map(move=>move.id)]);
          throw error;
        }
        return gear;
      } finally {
        pendingGear.delete(actor.uuid);
      }
    }
    if (!item.pack?.startsWith(`${ID}.`) || item.type === "gear") return super._onDropItem(event,item);
    if (!this.isEditable || (pokemon(actor) && item.type === "class")) return null;
    const data = item.toObject();
    if (!await allowCatalogAcquisition(actor,data)) return null;
    if (pokemon(actor) && item.type === "move" && battleSlotsUsed(actor) >= actor.system.battleMoveLimit) {
      data.system.knownOnly = true;
    }
    delete data._id;
    delete data.folder;
    return await createCatalogItem(actor,data) ?? null;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const {system} = actor;
    const trainer = linkedTrainer(actor);
    const pool = (label, key, owner) => ({label,key,editable:owner.isOwner,
      actions:actions.map(name => ({key:name,label:titleCase(name),spent:owner.system[key === "team" ? "partnerActions" : "actions"][name]}))
    });
    let speciesProfile;
    let speciesProfileUnavailable = false;
    if (pokemon(actor) && system.dexPage) {
      try {
        const entry = (await dexProfiles()).get(system.dexPage);
        if (entry && normalizeRequirement(entry.name) === normalizeRequirement(system.species)) speciesProfile = entry;
        else speciesProfileUnavailable = true;
      } catch (error) {
        console.error("PTE could not load species details",error);
        speciesProfileUnavailable = true;
      }
    }
    const pools = trainer ? [pool("Shared Pokémon Actions","team",trainer)] : [pool(pokemon(actor) ? "Round Actions" : "Trainer Actions","own",actor)];
    if (!pokemon(actor)) pools.push(pool("Shared Pokémon Actions","team",actor));
    const groups = Object.entries(itemTypes).filter(([type]) => !pokemon(actor) || (type !== "class" && type !== "feature")).map(([type,label]) => ({type,label,items:actor.items.filter(i => i.type === type && (!pokemon(actor) || (!isRoleItem(i) && !isAbilityItem(i)))).map(i => ({
        id:i.id,name:i.name,knownOnly:i.type === "move" && i.system.knownOnly,sceneUses:i.system.useScene===system.attackScene ? i.system.sceneUses : 0,move:type === "move",gear:type === "gear",canEquip:type === "gear" && !i.system.inStorage && i.system.quantity > 0 && (i.system.equipped || equipmentEligible(i,pokemon(actor))),
        slotLabel:type === "gear" ? itemSlotLabel(i) : "",
        itemKeywords:type === "gear" ? [...itemKeywords(i)].map(titleCase).join(" · ") : "",
        usable:!i.system.inStorage && !i.system.impaired && (!pokemon(actor) || i.type !== "gear" || itemKeywords(i).has("pokemon")) && Boolean(recoveryListing(i) || boostListing(i) || maladyListing(i) || pokeballListing(i)) && i.system.quantity > 0,price:type === "gear" ? gearPrice(i) : "",system:i.system
      }))}));
    const features = groups.find(group=>group.type === "feature");
    const featureGroups = features ? trainerFeatureGroups.map(category=>({
      ...features,label:category.label,addLabel:category.addLabel,featureGroup:category.key,compact:true,
      items:features.items.filter(row=>trainerFeatureGroup(catalogListing(actor.items.get(row.id))) === category.key)
    })) : [];
    const classes = groups.find(group=>group.type === "class");
    const trainerCardGroups = classes ? [{...classes,addLabel:"Add Class",compact:true},
      ...featureGroups.filter(group=>group.featureGroup === "class")] : [];
    const profileGroups = featureGroups.filter(group=>group.featureGroup !== "class");
    const trainerSize = system.trainerIdentity?.size?.trim().toLowerCase();
    const trainerSizeOptions = ["Small","Medium","Large"].map(value=>({value,selected:value.toLowerCase() === trainerSize}));
    const tierLevel = tier(system.level,pokemon(actor));
    const tierValue = [5,10,20][tierLevel - 1];
    const teamTrainer = pokemon(actor) ? trainer : actor;
    return {...context, actor, system, slots:slotTotals(actorGear(actor),pokemon(actor)), editable:this.isEditable, pokemon:pokemon(actor), tier:tierLevel,tierValue,
      speciesProfile,speciesProfileUnavailable,capabilityGroups,
      classCapabilities:grantedCapabilities(actor),
      actorCapabilities:actorCapabilityButtons(speciesProfile?.capabilities,[system.capabilityNotes,...grantedCapabilities(actor)].join(" ")),
      speciesAbilities:speciesAbilityNames(speciesProfile).map(name=>abilitiesByName.get(normalizeAbilityName(name))?.name || name).join(", "),
      ownedAbilities:pokemon(actor) ? actor.items.filter(isAbilityItem).map(item=>({id:item.id,name:item.name,spiritCost:item.system.spiritCost})) : [],
      speciesCapabilities:speciesProfile?.capabilities.split(/\s+(?=(?:Combat|Narrative)\s*[-–:])/),
      stats:Object.entries(stats).map(([key,label]) => ({key,label,value:system.stats[key]})),
      skills:skills.map((label,index) => ({index,label,rank:ranks.map((label,i) => ({label:pokemon(actor) ? `${i+1}d6` : label,value:i+1,selected:system.skills[`s${index}`] === i+1}))})),
      stages:Object.entries(stats).filter(([key])=>key!=="hp").map(([key,label])=>({
        key,label,current:system.stages[key],defaultStage:system.defaultStages[key],effective:combatStat(actor,key)
      })),
      effectiveMovement:Math.max(0,Math.floor((system.movement + gearBonus(actor,"movement") + Math.trunc(effectiveStage(actor,"spe") / 2)) / (afflicted(actor,"slowed") ? 2 : 1))),
      equipmentReduction:effectiveReduction(actor),
      canRaiseShield:equippedGear(actor).some(item=>item.name === "Heavy Shield"),
      potionEffects:[...Object.entries(system.potionBonuses),...Object.entries(system.potionStages)].filter(([,value])=>value).map(([key,value])=>({label:potionVariants[key],value})),
      fainted:system.health.value <= 0,
      conditions:Object.entries(conditions).map(([key,label])=>({
        key,label,active:hasCondition(actor,key),granted:grantedCondition(system,key)
      })),
      afflictions:Object.entries(afflictions).map(([key,label])=>({key,label,active:afflicted(actor,key)})),
      evasion:["def","spd","spe"].map(key => evasion(combatStat(actor,key))).join(" / "),
      type1:choices(["",...types],system.type1),type2:choices(["",...types],system.type2),
      defensiveMatchups:types.flatMap(type=>{
        const factor = effectiveness(type,elements(actor));
        return factor === 1 ? [] : [{type,label:matchupLabel(factor)}];
      }),
      trainers:game.actors.filter(a => a.type === "trainer" && a.visible).map(a => ({name:a.name,id:a.id,selected:a.id === system.trainerId})),
      partners:teamTrainer ? game.actors.filter(a => pokemon(a) && a.visible && a.id !== actor.id && a.system.trainerId === teamTrainer.id) : [],
      pokemonProgression:pokemon(actor) ? {
        trained:[system.trainedSkill1,system.trainedSkill20].filter(Boolean).map(key=>skills[Number(key.slice(1))]),
        history:system.progressionHistory.split("\n").filter(Boolean),
        rewards:[["trainedSkill1",1,"Train a Skill"],["role",1,"Apply Primary Role Stats"],["tutor10",10,"Learn Tier 1 Tutor Attack"],
          ["trainedSkill20",20,"Train a Second Skill"],["tutor20",20,"Learn Tier 1 or 2 Tutor Attack"],
          ["tutor30",30,"Learn Tier 1 or 2 Tutor Attack"],["stats40",40,"Apply +5 to Two Stats"],
          ["tutor40",40,"Learn Tier 2 or 3 Tutor Attack"],["tutor50",50,"Learn Tier 2 or 3 Tutor Attack"],
          ["stats50",50,"Apply +5 to Two Stats (Base Total ≤ 45)"]]
          .filter(([key,level])=>system.level >= level && !(key.startsWith("trained") ? system[key] : system.progressionClaims[key]))
          .map(([key,level,label])=>({key,level,label}))
      } : null,
      trainerProgression:!pokemon(actor) ? {
        meritGoal:system.meritGoal || trainerMeritGoal(system.level),
        cap:pokemonLevelCap(system.level),canLevel:system.level < 20,
        canStart:system.level === 1 && !system.startingProgression,
        virtuoso:system.virtuosoSkill ? skills[Number(system.virtuosoSkill.slice(1))] : "",
        history:system.progressionHistory.split("\n").filter(Boolean)
      } : null,
      walletBalance:actor.type === "trainer" ? formatMoney(system.money) : null,
      walletHistory:(system.walletHistory || "").split("\n").filter(Boolean),
      roles:pokemon(actor) ? actor.items.filter(isRoleItem).map(item=>({
        id:item.id,name:item.name,startingStats:catalogListing(item).startingStats,description:itemDescription(item)
      })) : [],
      rankOneUnlocked:system.level >= 10,
      pools,battleSlots:pokemon(actor) ? battleSlotsUsed(actor) : null,trainerCap:trainer ? pokemonLevelCap(trainer.system.level) : null,
      panels:[["profile","Profile"],["status","Afflictions & Conditions"],["moves","Moves"],["known","Known Moves"],["bag","Bag"],["team","Team"],["skills","Skills"]]
        .map(([key,label])=>({key,label,active:key === this.activePanel})),
      statusActive:this.activePanel === "status",
      profileActive:this.activePanel === "profile",bagActive:this.activePanel === "bag",
      teamActive:this.activePanel === "team",skillsActive:this.activePanel === "skills",
      identityFields:pokemon(actor) ? [] : [["idNumber","ID No."],["birthDate","DOB"],["age","Age"],
        ["eyes","Eyes"],["hair","Hair"],["height","Ht."],["weight","Wt."]]
        .map(([key,label])=>({key,label,value:system.trainerIdentity?.[key]})),
      trainerSizeOptions,trainerSizeSelected:trainerSizeOptions.some(option=>option.selected),
      trainerCardGroups,profileGroups,bagGroups:groups.filter(group=>group.type === "gear"),
      movesActive:this.activePanel === "moves",knownActive:this.activePanel === "known",
      moveGroups:groups.filter(group=>group.type === "move").map(group=>({...group,items:group.items.filter(item=>!item.knownOnly)})),
      knownGroups:groups.filter(group=>group.type === "move").map(group=>({...group,label:"Known Moves",known:true,
        items:group.items.filter(item=>item.knownOnly)}))
    };
  }
}

async function placeManualRange() {
  if (!canvas.ready) return ui.notifications.warn("Open a scene before placing a template.");
  const form = await DialogV2.prompt({
    classes:["pte-dialog"],window:{title:"Place Manual Template"},
    content:`<label>Shape <select name="kind">
      <option value="zone">Rectangle / Zone</option><option value="centeredZone">Rectangle Centered on Selected Token</option><option value="zoneCells">Connected Zone</option><option value="circle">Circle</option>
      <option value="line">Line</option><option value="cone">Cone</option>
      <option value="closeBlast">Close Blast</option><option value="rangedBlast">Ranged Blast</option><option value="burst">Burst</option>
    </select></label>
    <label>Length, radius (m), or connected square count <input name="length" type="number" min="1" step="1" value="3" required></label>
    <label>Rectangle width (m) <input name="width" type="number" min="1" step="1" value="3" required></label>
    <label>Ranged Blast reach (m) <input name="reach" type="number" min="1" step="1" value="6" required></label>`,
    ok:{label:"Place",callback:(event,button)=>new FormData(button.form)},rejectClose:false
  });
  if (!form) return;
  const kind = form.get("kind");
  const length = Number(form.get("length"));
  const width = Number(form.get("width"));
  const reach = Number(form.get("reach"));
  if (!["zone","centeredZone","zoneCells","circle","line","cone","closeBlast","rangedBlast","burst"].includes(kind) ||
    ![length,width,reach].every(value=>Number.isSafeInteger(value) && value > 0)) {
    return ui.notifications.warn("Choose a shape and enter positive whole-meter dimensions.");
  }
  const source = ["centeredZone","closeBlast","rangedBlast","burst","line"].includes(kind) ? canvas.tokens.controlled[0] : null;
  return placeRangeTemplate({kind,length,width:["closeBlast","rangedBlast"].includes(kind) ? length : width,reach,targetLimit:length,label:"Manual template"},source,"Manual template",{manual:true});
}

async function placeMoveRange(item) {
  if (item?.type !== "move") return;
  if (!canvas.ready) return ui.notifications.warn("Open a scene before placing a move range.");
  const shapes = rangeShapes(item.system.range,itemDescription(item));
  if (!shapes.length) return ui.notifications.info("This move has no fixed map shape or numeric range.");
  const index = shapes.length === 1 ? 0 : await DialogV2.prompt({
    classes:["pte-dialog"],window:{title:"Choose Move Range"},
    content:`<label>Range <select name="shape">${shapes.map((shape,index)=>
      `<option value="${index}">${escape(shape.label)}</option>`).join("")}</select></label>`,
    ok:{label:"Place",callback:(event,button)=>Number(new FormData(button.form).get("shape"))},rejectClose:false
  });
  if (index == null || !shapes[index] || !canvas.ready) return;
  const actor = item.parent;
  const controlled = canvas.tokens.controlled.find(token=>!actor || token.actor?.uuid === actor.uuid);
  const active = actor?.token?.object ?? actor?.getActiveTokens()?.filter(token=>token.isVisible);
  const source = controlled ?? (Array.isArray(active) ? active.length === 1 ? active[0] : null : active);
  try {
    return await placeRangeTemplate(shapes[index],source,item.name);
  } catch (error) {
    console.error("PTE range placement failed",error);
    ui.notifications.error("The range template could not be placed.");
  }
}

class PTEItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {classes:["pte","pte-item"],tag:"form",position:{width:550,height:"auto"},
    form:{submitOnChange:true,closeOnSubmit:false},
    actions:{
      moveRange() { return placeMoveRange(this.document); },
      editWeapon() { return createWeapon(this.document.parent,this.document); },
      async claimGrant(event,target) {
        await claimGrant(this.document,target.dataset.grant);
        return this.render({parts:["body"]});
      },
      openClassFeature(event,target) { return this.document.parent?.items.get(target.dataset.id)?.sheet.render({force:true}); },
      async addClassFeature(event,target) {
        const item = this.document;
        const actor = item.parent;
        if (!actor?.isOwner || !actor.items.has(item.id)) return;
        const index = Number(target.dataset.index);
        const feature = classFeatureEntries(catalogListing(item),actor).find(row=>row.index === index && row.canAdd);
        if (!feature) return ui.notifications.warn("The feature is owned or its requirements have changed.");
        const data = catalogItemData(bookCatalog[index]);
        if (!await allowCatalogAcquisition(actor,data)) return;
        const created = await createCatalogItem(actor,data);
        await this.render({parts:["body"]});
        return created?.sheet.render({force:true});
      },
      paySpirit() {
      const item = this.document;
      if (item.type !== "move" && item.system.spiritCost > 0) {
        return changeSpirit(item.parent,-item.system.spiritCost,item.name);
      }
    }}
  };
  static PARTS = {body:{template:`${root}/templates/item.hbs`,scrollable:[""]}};
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const listing = catalogListing(item);
    const slotSizes = choices(["","Small","Medium","Large"],item.system.slotSize);
    const gearKeywords = item.type === "gear" ? [...itemKeywords(item)].map(titleCase).join(", ") : "";
    const variants = Object.keys(boostListing(item) || maladyListing(item) || {}).map(value=>({value,label:potionVariants[value] || afflictions[value],selected:item.system.variant===value}));
    const description = itemDescription(item,listing);
    const [sourceName,pageNumber] = item.system.source.split(", p. ");
    const sourceKey = Object.keys(books).find(key => books[key] === sourceName ||
      (key === "occultism" && sourceName === "Path of Occultism (draft)"));
    const referenceSource = source => {
      if (!source) return null;
      const key = Object.keys(books).find(key=>books[key] === source.book ||
        (key === "occultism" && source.book === "Path of Occultism (draft)"));
      return {label:`${source.book}, p. ${source.page}`,url:key && source.page ? bookLink(key,source.page) : ""};
    };
    const selectedTerrains = item.parent && listing?.name === "Wild Adaptation" ? actorNaturewalks(item.parent) : null;
    const classCharts = classReferences(item.type === "class" ? listing?.name : featureClass(listing)?.name,
      item.type === "feature" ? listing?.name : null,bookCatalog).map(section=>({...section,
        source:referenceSource(section.source),
        rows:section.rows.map(row=>({...row,applies:selectedTerrains?.has(normalizeRequirement(row.name)),source:referenceSource(row.source)}))
      }));
    const sourceLink = item.system.source.startsWith("PTE Attacks & Ability Reference, ") ? attackReference : sourceKey && /^\d+$/.test(pageNumber) ? bookLink(sourceKey,Number(pageNumber)) : "";
    return {...context,item,system:item.system,gearKeywords,slotSizes,
      canEditWeapon:this.isEditable && item.parent?.type === "trainer" && item.type === "gear" && Boolean(item.system.weaponSkill),ownedGear:item.type === "gear" && Boolean(item.parent),price:item.type === "gear" ? gearPrice(item) : "",
      canPaySpirit:item.type !== "move" && item.parent?.isOwner && item.system.spiritCost > 0,
      classFeatures:classFeatureEntries(listing,item.parent),classCharts,
      parentClass:featureClass(listing)?.name,
      classGrants:grantsFor(item).map(grant=>({...grant,canClaim:item.parent?.isOwner && grant.ready && !grant.claimed && grant.options.length >= Math.max(1,grant.count),
        needsTerrain:item.parent && grant.id === "adaptation" && !grant.options.length,
        grantedNames:grant.claimed?.map(reward=>reward.name).join(", ")})),
      sourceLink,description,variants,variableDb:item.system.variableDb || listing?.stats?.variableDb,pokemonMove:item.type === "move" && item.parent?.type === "pokemon",prerequisites:listing?.prerequisites,keywords:listing?.keywords, tierName:listing?.tier, requirements:listing?.requirements, versatile:listing?.versatile,
      frequency:item.system.frequency || listing?.frequency,action:item.system.action || listing?.action,
      priceNote:listing?.priceNote,pricePage:listing?.pricePage,editable:this.isEditable,move:item.type === "move",gear:item.type === "gear",feature:item.type === "feature",
      categories:choices(["Physical","Special","Status","WT"],item.system.category),
      elements:choices(["",...types],item.system.element)};
  }
}

class Dex extends HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = {classes:["pte","pte-dex"],position:{width:580,height:580},window:{title:"Pokédex",resizable:true},
    actions:{
    selectSpecies(event,target) {
      this.selectedPage = Number(target.dataset.page);
      return this.render({parts:["body"]});
    },
    profile(event,target) { return showProfile(Number(target.dataset.page)); }, async importEntry(event,target) {
      const entry = this.entries.find(row => row.page === Number(target.dataset.page));
      if (!entry) return;
      const system = {species:entry.name,dexPage:entry.page,stats:entry.stats,type1:entry.types[0] ?? "",type2:entry.types[1] ?? ""};
      const art = await tokenArtwork(entry.page);
      const profile = (await dexProfiles()).get(entry.page);
      const footprint = pokemonTokenFootprint(profile?.profile);
      if (this.destination?.isOwner) {
        system.health = {value:maxHP(this.destination.system.level,entry.stats.hp,true)};
        await this.destination.update({system,...prototypeFootprintUpdates(footprint),...tokenArtworkUpdates(art)});
        if (art.token || footprint) {
          await syncSceneTokens(this.destination,{...footprint,...(art.token ? {"texture.src":art.token} : {})});
        }
      } else {
        if (!game.user.can("ACTOR_CREATE")) return ui.notifications.warn("You need permission to create an Actor.");
        const actor = await Actor.create({type:"pokemon",name:entry.name,system,items:startingMoveData(entry),
          prototypeToken:{...footprint,...(art.token ? {texture:{src:art.token}} : {})},
          ...(art.portrait ? {img:art.portrait} : {})});
        actor?.sheet.render({force:true});
      }
    }}
  };
  static PARTS = {body:{template:`${root}/templates/dex.hbs`}};
  constructor({destination,...options} = {}) {
    super(options);
    this.destination = destination;
    this.selectedPage = destination?.system.dexPage;
    this.query = "";
  }
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.entries ??= await dex();
    const selection = this.entries.find(entry=>entry.page === this.selectedPage) ?? this.entries[0];
    this.selectedPage = selection?.page;
    const art = selection ? await tokenArtwork(selection.page) : {};
    const entries = this.entries.map(entry=>({...entry,typing:entry.types.join(" / "),selected:entry.page === this.selectedPage}));
    return {...context,entries,applying:Boolean(this.destination),query:this.query,
      selected:selection ? {...selection,typing:selection.types.join(" / "),portrait:art.portrait,token:art.token,
        moves:selection.starting.join(", ")} : null};
  }
  _onRender(context,options) {
    super._onRender(context,options);
    const input = this.element.querySelector("input[type=search]");
    const filter = () => {
      this.query = input.value;
      const query = this.query.trim().toLowerCase();
      for (const row of this.element.querySelectorAll("[data-search]")) row.hidden = !row.dataset.search.toLowerCase().includes(query);
    };
    input.addEventListener("input",filter);
    filter();
    this.element.querySelector('[data-action="selectSpecies"][aria-pressed="true"]')?.scrollIntoView({block:"nearest"});
  }
}

Hooks.once("init", () => {
  registerTwoSideCombatTracker(ID, {resetPartyActions});
  CONFIG.Actor.documentClass = PTEActor;
  Object.assign(CONFIG.Actor.dataModels,{trainer:TrainerData,pokemon:PokemonData});
  Object.assign(CONFIG.Item.dataModels,{move:MoveData,gear:GearData,feature:FeatureData,class:FeatureData});
  const {DocumentSheetConfig} = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(Actor, ID, PTESheet, {types:["trainer","pokemon"],makeDefault:true});
  DocumentSheetConfig.registerSheet(Item, ID, PTEItemSheet, {types:Object.keys(itemTypes),makeDefault:true});
  for (const [key,title] of Object.entries(books)) {
    game.settings.register(ID,`pdf-${key}`,{name:`${title} PDF path`,
      hint:"Enter a Foundry Data path or an HTTPS URL accessible to your group.",
      scope:"world",config:true,type:String,default:""});
  }
  game.settings.register(ID,"token-directory",{name:"Pokémon artwork folder",
    hint:"Foundry Data folder containing Portraits and Ringed Tokens, or the older page-number PNGs.",scope:"world",config:true,type:String,default:"pte-tokens"});
  game.pte = {openDex:() => new Dex().render({force:true}),openBooks:showBooks,openClock:() => {
    const open = game.modules.get("pte-campaign-time")?.api?.open;
    return open ? open() : ui.notifications.warn("Enable the PTE Campaign Clock, Calendar & Weather module.");
  }};
});

Hooks.on("preCreateItem", (item) => {
  const actor = item.parent;
  if (item.type !== "gear" || !["trainer","pokemon"].includes(actor?.type)) return;
  const totals = proposedSlots(actor,item,{});
  if (totals.problems.length) {
    item.updateSource({"system.inStorage":true,"system.equipped":false});
    ui.notifications.info(`${item.name} went to Storage because the carried or equipped load would violate the slot rules.`);
  }
});

Hooks.on("preUpdateItem", (item,changes) => {
  const actor = item.parent;
  if (item.type !== "gear" || !["trainer","pokemon"].includes(actor?.type)) return;
  const update = foundry.utils.expandObject(changes);
  const relevant = ["equipped","quantity","slotKeywords","slotSize","inStorage"];
  if (!relevant.some(key=>Object.hasOwn(update.system || {},key)) && !Object.hasOwn(update,"name")) return;
  const before = slotTotals(actorGear(actor),pokemon(actor));
  const gear = actorGear(actor).map(row=>row._id === item.id ?
    {...row,name:update.name ?? row.name,system:{...row.system,...update.system}} : row);
  const after = slotTotals(gear,pokemon(actor));
  const problem = after.problems.find(message=>!before.problems.includes(message));
  if (problem || (after.inventory > before.inventory && after.inventory > after.inventoryMax) ||
    (after.equipment > before.equipment && after.equipment > after.equipmentMax)) {
    ui.notifications.warn(problem || "This change exceeds the available slots.");
    return false;
  }
});

Hooks.on("updateActor", (actor, changes) => {
  if (actor.type !== "trainer" || !changes.system?.partnerActions) return;
  for (const partner of game.actors.filter(candidate => linkedTrainer(candidate)?.id === actor.id)) {
    if (partner.sheet?.rendered) partner.sheet.render();
  }
});

Hooks.on("deleteCombat", async combat => {
  if (!game.users.activeGM?.isSelf || !combat.started) return;
  const actors = new Map(combat.combatants.filter(combatant=>combatant.actor)
    .map(({actor})=>[actor.uuid,actor]));
  await Promise.allSettled([...actors.values()].map(actor=>actor.update(clearSceneConsumables(actor.system))));
});

Hooks.once("ready", async () => {
  if (!game.users.activeGM?.isSelf) return;
  try {
    await installJournalLibrary();
  } catch (error) {
    console.error("PTE Rule Library setup failed",error);
    ui.notifications.error("The PTE Rule Library could not be set up. See the console for details.");
  }
});
