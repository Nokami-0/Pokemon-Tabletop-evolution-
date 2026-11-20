import {referenceEffects} from "../data/effects.mjs";
import {capabilityGroups} from "../data/capabilities.mjs";
import {normalizeRequirement, requirementResult, speciesRequirement, normalizeAbilityName, speciesAbilityNames, normalizeMoveName} from "./prerequisites.mjs";
import {catalog as bookCatalog} from "../data/catalog.mjs";
import {attackCatalog} from "../data/attacks.mjs";
const catalog = [...bookCatalog,...attackCatalog];
const attackReference = "https://docs.google.com/spreadsheets/d/1t6aEWjhpgM7m93lNExN4cNAFnuPEr53n_vbtsPZM99k/edit";
import {TrainerData, PokemonData, MoveData, GearData, FeatureData} from "./models.mjs";
import {stats, skills, ranks, types, effectiveness, matchupLabel, tier, maxHP, evasion, successes, damageFormula, stagedStat, afflictions, conditions, grantedCondition, afflictionImmunities, afflictionTickDamage, recoveryGear, recoveryPlan, boostGear, boostPlan, potionVariants, capCombatModifier, maladyGear, maladyPlan, moveActionCost, moveUsePlan, combatDamageUpdate, restPlan, basicAttackProfiles, basicAttackData, opposedResult, pokemonLevelCap, pokemonLevelPlan, allocateLevelPoints, walletBalance} from "./rules.mjs";

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
function combatStat(actor,key) {
  const stage = actor.system.stages?.[key] ?? 0;
  const penalty = (key === "def" && afflicted(actor,"burned")) || (key === "spd" && afflicted(actor,"poisoned"));
  return stagedStat(actor.system.stats[key],stage - (penalty ? 2 : 0));
}
const hasCondition = (actor,key) => actor.system.health.value > 0 &&
  (Boolean(actor.system.conditions[key]) || grantedCondition(actor.system,key));
const potionBonus = (actor,key) => actor.system.potionBonuses?.[key] ?? 0;
const accuracyModifier = actor => capCombatModifier(actor.system.accuracy +
  potionBonus(actor,"accuracy") - (afflicted(actor,"cursed") ? 3 : 0)) -
  (hasCondition(actor,"blinded") || hasCondition(actor,"tripped") ? 6 : 0);
function attackEvasion(actor, defense) {
  if (hasCondition(actor,"vulnerable")) return 0;
  return capCombatModifier(Math.max(evasion(defense),afflicted(actor,"slowed") ? 0 : evasion(combatStat(actor,"spe"))) +
    actor.system.evasion + potionBonus(actor,"evasion") - (afflicted(actor,"cursed") ? 3 : 0));
}
const pokemon = actor => actor.type === "pokemon";
const linkedTrainer = actor => pokemon(actor) && game.actors.get(actor.system.trainerId);
function actionPool(actor,pool) {
  const trainer = linkedTrainer(actor);
  return {owner:trainer || actor,key:trainer || pool === "team" ? "partnerActions" : "actions"};
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

async function tokenArtwork(page) {
  if (!Number.isInteger(page) || page < 1) return "";
  const directory = game.settings.get(ID,"token-directory").trim().replace(/\/+$/,"");
  if (!directory) return "";
  const path = `${directory}/${page}.png`;
  try {
    const response = await fetch(foundry.utils.getRoute(path),{method:"HEAD"});
    return response.ok && (response.headers.get("content-type") || "").includes("image/png") ? path : "";
  } catch {
    return "";
  }
}

async function applySpeciesArtwork(actor) {
  if (!actor.isOwner || actor.type !== "pokemon") return;
  const art = await tokenArtwork(actor.system.dexPage);
  if (!art) return ui.notifications.warn("Install the PNG pack in the configured Foundry Data folder.");
  await actor.update({img:art,"prototypeToken.texture.src":art});
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

async function skill(actor, index) {
  const rank = actor.system.skills[`s${index}`];
  const args = await DialogV2.prompt({classes:["pte-dialog"],
    window:{title:skills[index]},
    content:`<label>Challenge Rating <input name="cr" type="number" min="0" value="2"></label>
      <label>Modifier <select name="mode"><option value="4">Normal</option><option value="3">Boon</option><option value="5">Bane</option></select></label>
      <label>Spirit Points <input name="sp" type="number" min="0" max="${Math.max(0,Math.min(actor.isOwner ? actor.system.spirit : 0, rank - 1))}" value="0"></label>`,
    ok:{label:"Roll", callback:(event, button) => new FormData(button.form)},
    rejectClose:false
  });
  if (!args) return;
  const sp = Math.max(0,Math.min(actor.isOwner ? actor.system.spirit : 0, rank - 1, Math.trunc(Number(args.get("sp")) || 0)));
  const cr = Math.max(0, Math.trunc(Number(args.get("cr")) || 0));
  if (sp) await actor.update({"system.spirit":actor.system.spirit - sp});
  const roll = await new Roll(`${rank + sp}d6`).evaluate();
  const count = successes(roll.dice[0].values, Number(args.get("mode")));
  await roll.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor:`<strong>${skills[index]}</strong> · ${count} successes · CR ${cr} · ${count >= cr ? "Pass" : "Fail"}`});
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
    const roll = await new Roll(`${participant.system.skills[`s${index}`]}d6`).evaluate();
    const dice = roll.dice[0].values;
    return {name:participant.name,skill:skills[index],roll,dice,successes:successes(dice,threshold),total:dice.reduce((sum,value)=>sum+value,0)};
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

async function spendMove(actor,item,pool) {
  const cost = moveActionCost(item.system.action);
  if (!cost) return {error:"This action cost requires manual resolution. Use Roll Only."};
  const plan = moveUsePlan(item.system,actor.system.attackTurn,actor.system.attackScene);
  if (plan.error) return plan;
  if (cost.some(key=>pool.owner.system[pool.key][key])) return {error:"A required action is already spent."};
  const actionChanges = spent => Object.fromEntries(cost.map(key=>[`system.${pool.key}.${key}`,spent]));
  if (cost.length) await pool.owner.update(actionChanges(true));
  try {
    await item.update(plan.updates);
  } catch (error) {
    if (cost.length) await pool.owner.update(actionChanges(false));
    throw error;
  }
  return {cost};
}

async function useMove(actor, item, pool = null) {
  if (item?.type !== "move") return;
  if (pokemon(actor) && item.system.knownOnly) return ui.notifications.warn("Move this attack to the Battle list first.");
  if (actor.system.health.value <= 0) return ui.notifications.warn("This combatant has fainted.");
  const move = item.system;
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
  const critical = move.category !== "Status" && natural >= Math.max(1,move.crit - capCombatModifier(potionBonus(actor,"crit")));
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
    const amount = hit && damage ? Math.floor(Math.max(0,damage.total-defense-target.system.reduction)*factor) : 0;
    const result = immune ? matchupLabel(0) : !hit ? "Miss" : !damage ? "Hit" : `Hit · ${amount} damage`;
    const typing = targetTypes.length ? ` (${targetTypes.map(escape).join(" / ")})` : "";
    const matchup = damage && !immune ? ` · ${matchupLabel(factor)}` : "";
    return {token,target,amount,line:`<li>${escape(token.name)}${typing} · ${needsAccuracy ? `TN ${needed} · ` : ""}${result}${matchup}</li>`};
  });
  let tracked = "";
  if (pool) {
    const outcome = await spendMove(actor,item,pool);
    if (outcome.error) return ui.notifications.warn(outcome.error);
    tracked = outcome.cost.length ? ` · Spent ${outcome.cost.map(titleCase).join(" + ")}` : " · Free action tracked";
  }
  const lines = results.map(result=>result.line);
  const range = [move.element,move.category,move.range,move.frequency,move.action].map(escape).join(" · ");
  await roll.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor:
    `<strong>${escape(item.name)}</strong><br>${range}${tracked}<br>${needsAccuracy ? `AC ${move.ac}` : "No AC · d20 for critical or effect ranges"}${critical ? " · Critical" : ""}
      ${damage ? ` · DB ${db} · Raw damage ${damage.total} (${escape(damage.formula)})` : variableDb ? " · Resolve damage or HP loss from the effect" : ""}
      ${lines.length ? `<ul>${lines.join("")}</ul>` : damage ? "<p>Target a token to calculate defenses and type effectiveness.</p>" : ""}<p>${escape(itemDescription(item)).replace(/\n/g,"<br>")}</p>`});
  if (pool) await applyMoveDamage(results);
}

async function rollBasicAttack(actor) {
  if (!actor.isOwner) return;
  const types = elements(actor);
  const form = await DialogV2.prompt({classes:["pte-dialog"],
    window:{title:"Basic Attack"},
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
  const item = {name:"Basic Attack",type:"move",basic:true,uuid:`${actor.uuid}.BasicAttack`,
    system:{...actor.system.basicAttack,...data},
    update:changes=>actor.update(Object.fromEntries(Object.entries(changes).map(([path,value])=>
      [path.replace("system.","system.basicAttack."),value])))};
  if (form.has("manual")) return useMove(actor,item);
  return trackedMove(actor,item);
}

async function applyMoveDamage(results) {
  const writable = new Map();
  for (const hit of results) {
    if (!hit.amount || !hit.target.isOwner) continue;
    const prior = writable.get(hit.target.uuid);
    if (!prior || hit.amount > prior.amount) writable.set(hit.target.uuid,hit);
  }
  const eligible = [...writable.values()];
  if (!eligible.length) return;
  const form = await DialogV2.prompt({classes:["pte-dialog"],
    window:{title:"Apply Rolled Damage"},
    content:`<p>Apply to selected targets you can edit. Identical linked actors are listed once. Resolve special defenses at the table.</p>
      ${eligible.map((hit,index)=>`<label><input type="checkbox" name="target" value="${index}"> ${escape(hit.token.name)} · ${hit.amount} damage</label>`).join("")}`,
    ok:{label:"Apply Selected",callback:(event,button)=>new FormData(button.form)},
    rejectClose:false
  });
  if (!form) return;
  const selected = new Set(form.getAll("target"));
  const changes = await Promise.allSettled(eligible.filter((hit,index)=>selected.has(String(index)) && hit.target.isOwner)
    .map(hit=>hit.target.update(combatDamageUpdate(hit.target.system,hit.amount))));
  if (changes.some(change=>change.status === "rejected")) ui.notifications.warn("Some target damage could not be applied. Check the target sheets.");
}

const itemTypes = {move:"Moves",gear:"Bag",feature:"Features",class:"Classes"};

const entrySource = entry => entry.source || `${entry.book}, p. ${entry.page}`;
const listingKey = (type, source, name) => `${type}|${source}|${name}`;
const catalogListings = new Map(catalog.map(entry => [
  listingKey(entry.kind, entrySource(entry), entry.name),entry
]));
const catalogListing = item => catalogListings.get(listingKey(item.type,item.system.source,item.name));
const roleCategory = "Pokémon Roles";
const isRoleItem = item => catalogListing(item)?.category === roleCategory;
const abilityCategory = "Pokémon Abilities";
const isAbilityItem = item => catalogListing(item)?.category === abilityCategory;
const abilitiesByName = new Map(catalog.filter(entry=>entry.category === abilityCategory)
  .map(entry=>[normalizeAbilityName(entry.name),entry]));
const gearPrice = item => item.system.price || catalogListing(item)?.price || "";

const catalogNames = new Set(catalog.filter(entry=>entry.kind === "class" || entry.kind === "feature")
  .map(entry=>normalizeRequirement(entry.name)));

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
  const owned = new Set();
  const classes = new Set();
  const featureCounts = new Map();
  const counted = new Set();
  for (const item of actor.items) {
    if (item.type !== "class" && item.type !== "feature") continue;
    const name = normalizeRequirement(item.name);
    owned.add(name);
    if (item.type === "class") classes.add(name);
    const listing = catalogListing(item);
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
  const prerequisites = entry.prerequisites || [];
  const result = requirementResult(prerequisites,{level:actor.system.level,skills:actor.system.skills,owned,classes,featureCounts,catalogNames});
  if (result === false) return {error:"Prerequisites unmet. " + prerequisites.join(" / ")};
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
        return {review:actor.system.level < 30 ?
          "The normal second ability is available at level 30. Verify a separate rule if it is being granted earlier." :
          actor.items.filter(isRoleItem).length >= 2 ?
            "This Pokémon already has a second role. Verify an alternate rule granting the extra ability." :
            "Confirm this ability is the chosen level 30 benefit or comes from another grant."};
      }
    }
  }
  return {};
}

async function allowCatalogAcquisition(actor,data) {
  if (data.type === "gear") return true;
  const entry = data.system && catalogListing(data);
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

async function pickCatalogEntry(type, rolesOnly, actor) {
  const groups = Object.groupBy(catalog.map((entry, index) => ({...entry,index}))
    .filter(entry => entry.kind === type && ((entry.category === roleCategory) === rolesOnly) &&
      (!pokemon(actor) || entry.category !== abilityCategory)), entry => entry.category);
  const options = Object.entries(groups).map(([label,entries]) =>
    `<optgroup label="${escape(label)}">${entries.map(entry =>
      `<option value="${entry.index}">${escape(entry.name)}${entry.price ? ` · ${escape(entry.price)}` : ""} ${entry.page ? ` · p. ${entry.page}` : entry.stats ? ` · ${escape(entry.stats.element)}` : ""}</option>`
    ).join("")}</optgroup>`
  ).join("");
  const selection = await DialogV2.prompt({classes:["pte-dialog"],
    window:{title:rolesOnly ? "Add Pokémon Role" : `Add ${titleCase(type)}`},
    content:`<label>Catalog <select name="entry">${rolesOnly ? "" : `<option value="custom">Custom ${escape(type)}</option>`}${options}</select></label>`,
    ok:{label:"Add",callback:(event,button) => new FormData(button.form).get("entry")},
    rejectClose:false
  });
  if (selection == null) return null;
  if (!rolesOnly && selection === "custom") return {name:`New ${titleCase(type)}`,type};
  const entry = catalog[Number(selection)];
  if (entry?.kind !== type || (entry.category === roleCategory) !== rolesOnly ||
    (pokemon(actor) && entry.category === abilityCategory)) return null;
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

const linkedEffectPlaceholder = "See the linked reference for this entry’s effects.";
const catalogEffect = entry => referenceEffects[entrySource(entry)] || entry.rules;
const categoryEffectPlaceholder = entry => `${entry.category}. See the cited page for prerequisites and effects.`;

function itemDescription(item, listing = catalogListing(item)) {
  const description = item.system.description;
  if (!listing || (description?.trim() && description !== linkedEffectPlaceholder &&
    description !== categoryEffectPlaceholder(listing))) return description;
  return catalogEffect(listing) || description;
}

function catalogItemData(entry) {
  return {name:entry.name,type:entry.kind,system:{source:entrySource(entry),
    ...entry.stats,
    ...(entry.price ? {price:entry.price} : {}),
    ...(entry.frequency ? {frequency:entry.frequency} : {}),
    ...(entry.action ? {action:entry.action} : {}),
    description:catalogEffect(entry) || (entry.source ? linkedEffectPlaceholder : categoryEffectPlaceholder(entry))}};
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

async function learnSpeciesMove(actor) {
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
    content:`<label>Eligible move <select name="move">${eligible.map((move,index)=>`<option value="${index}">${escape(move.name)} · ${escape(move.stats.element)}</option>`).join("")}</select></label>`,
    ok:{label:"Learn",callback:(event,button)=>new FormData(button.form).get("move")},rejectClose:false});
  if (choice == null) return;
  const move = eligible[Number(choice)];
  if (!move || actor.system.dexPage !== profile.page || actor.items.some(item=>item.type === "move" && normalizeRequirement(item.name) === normalizeRequirement(move.name))) return;
  const current = speciesRequirement(move,profile,actor.system.level);
  if (current.error || current.review) return ui.notifications.warn("The Pokémon is no longer eligible for that move.");
  const data = catalogItemData(move);
  data.system.knownOnly = battleSlotsUsed(actor) >= actor.system.battleMoveLimit;
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

async function useGear(actor,id) {
  const item = actor.items.get(id);
  const gear = recoveryListing(item);
  const boost = boostListing(item);
  const malady = maladyListing(item);
  if (!actor.isOwner || (!gear && !boost && !malady) || item.system.quantity < 1) return;
  if ((boost || malady) && !Object.hasOwn(boost || malady,item.system.variant)) return ui.notifications.warn("Choose a variant on the potion’s item sheet first.");
  const selected = [...game.user.targets].map(token => token.actor).filter(Boolean);
  if (selected.length > 1) return ui.notifications.warn("Select one target, or clear targets to use this on yourself.");
  if (malady && !selected.length) return ui.notifications.warn("Target a token to throw a Malady Potion.");
  const target = selected[0] ?? actor;
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
    if (!form || !actor.items.has(id) || item.system.quantity < 1) return;
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
      boost ? boostPlan(target.system,boost,variant) : recoveryPlan(target.system,gear,form.get("mode"),form.getAll("cure"));
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

async function levelPokemon(actor) {
  if (!actor.isOwner || !pokemon(actor)) return;
  const trainer = linkedTrainer(actor);
  if (!trainer) return ui.notifications.warn("Assign a Trainer before using guided progression.");
  const form = await DialogV2.prompt({classes:["pte-dialog"],window:{title:"Pokémon Progression"},
    content:`<p>Current level ${actor.system.level} · Trainer cap ${pokemonLevelCap(trainer.system.level)}</p>
      <label>Method <select name="method"><option value="milestone">Trainer leveled up · up to 5</option>
      <option value="training">Downtime Training · up to 20</option></select></label>
      <label>Levels gained <input type="number" name="gain" min="1" max="20" value="1" required></label>
      <p>Confirm eligibility with the GM. See Rule Book pp. 189–190 for move, role, and evolution milestones.</p>`,
    ok:{label:"Apply Levels",callback:(event,button)=>new FormData(button.form)},rejectClose:false});
  if (!form) return;
  const currentTrainer = linkedTrainer(actor);
  const plan = pokemonLevelPlan(actor.system.level,currentTrainer?.system.level,form.get("method"),Number(form.get("gain")));
  if (plan.error) return ui.notifications.warn(plan.error);
  const updates = {"system.level":plan.level,"system.levelPoints":actor.system.levelPoints+plan.points};
  if (actor.system.health.value > 0) updates["system.health.value"] = actor.system.health.value + plan.points;
  return actor.update(updates);
}

async function allocatePokemon(actor) {
  if (!actor.isOwner || !pokemon(actor) || !actor.system.levelPoints) return;
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

  static DEFAULT_OPTIONS = {
    classes:["pte","pte-actor"], tag:"form", position:{width:760,height:815}, window:{resizable:true},
    form:{submitOnChange:true,closeOnSubmit:false},
    actions:{
      sheetPanel(event,target) {
        this.activePanel = target.dataset.panel;
        const body = target.closest(".pte-body");
        for (const button of body.querySelectorAll("[data-action=sheetPanel]")) {
          button.setAttribute("aria-pressed",String(button.dataset.panel === this.activePanel));
        }
        for (const panel of body.querySelectorAll("[data-sheet-panel]")) {
          panel.hidden = panel.dataset.sheetPanel !== this.activePanel;
        }
        body.scrollTop = 0;
      },
      wallet(event,target) { return changeWallet(this.document,target.dataset.mode); },
      levelPokemon() { return levelPokemon(this.document); },
      allocatePokemon() { return allocatePokemon(this.document); },
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
        for (const key of Object.keys(this.document.system.potionBonuses)) updates[`system.potionBonuses.${key}`] = 0;
        return this.document.update({...updates,"system.healingPotionUsed":false});
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
      luck() { return new Roll("1d20").toMessage({speaker:ChatMessage.getSpeaker({actor:this.document}),flavor:"Luck Check"}); },
      basicAttack() { return rollBasicAttack(this.document); },
      advanceAttackTurn() { return this.document.update({"system.attackTurn":this.document.system.attackTurn + 1}); },
      resetAttackScene() { return this.document.update({"system.attackScene":this.document.system.attackScene + 1}); },
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
        const data = await pickCatalogEntry(type,rolesOnly,this.document);
        if (!data || !await allowCatalogAcquisition(this.document,data)) return;
        if (type === "move" && pokemon(this.document) && battleSlotsUsed(this.document) >= this.document.system.battleMoveLimit) {
          data.system = {...data.system,knownOnly:true};
        }
        const [item] = await this.document.createEmbeddedDocuments("Item",[data]);
        item?.sheet.render({force:true});
      },
      toggleBattleMove(event,target) {
        const actor = this.document;
        const item = actor.items.get(target.dataset.id);
        if (!this.isEditable || !pokemon(actor) || item?.type !== "move") return;
        if (item.system.knownOnly && !item.system.slotExempt && battleSlotsUsed(actor) >= actor.system.battleMoveLimit) {
          return ui.notifications.warn("The Battle Attack List is full.");
        }
        return item.update({"system.knownOnly":!item.system.knownOnly});
      },
      async remove(event,target) {
        const item = this.document.items.get(target.dataset.id);
        if (item && await DialogV2.confirm({classes:["pte-dialog"],window:{title:"Remove Item"},content:`<p>Remove ${escape(item.name)}?</p>`,rejectClose:false})) await item.delete();
      },
      useGear(event,target) { return useGear(this.document,target.dataset.id); },
      equip(event,target) {
        const item = this.document.items.get(target.dataset.id);
        return item?.update({"system.equipped":!item.system.equipped});
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
      speciesArtwork() { return applySpeciesArtwork(this.document); },
      learnSpeciesMove() { return learnSpeciesMove(this.document); },
      profile() { return showProfile(this.document.system.dexPage); },
      dex() { return new Dex({destination:this.document}).render({force:true}); },
      async openPartner(event,target) { return game.actors.get(target.dataset.id)?.sheet.render({force:true}); }
    }
  };
  static PARTS = {body:{template:`${root}/templates/actor.hbs`,scrollable:[".pte-body"]}};
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
    const groups = Object.entries(itemTypes).filter(([type]) => type !== "class" || !pokemon(actor)).map(([type,label]) => ({type,label,items:actor.items.filter(i => i.type === type && (!pokemon(actor) || (!isRoleItem(i) && !isAbilityItem(i)))).map(i => ({
        id:i.id,name:i.name,knownOnly:pokemon(actor) && i.system.knownOnly,sceneUses:i.system.useScene===system.attackScene ? i.system.sceneUses : 0,move:type === "move",gear:type === "gear",usable:Boolean(recoveryListing(i) || boostListing(i) || maladyListing(i)) && i.system.quantity > 0,price:type === "gear" ? gearPrice(i) : "",system:i.system
      }))}));
    const onProfile = group => group.type === "class" || group.type === "feature";
    const teamTrainer = pokemon(actor) ? trainer : actor;
    return {...context, actor, system, editable:this.isEditable, pokemon:pokemon(actor), tier:tier(system.level,pokemon(actor)),
      speciesProfile,speciesProfileUnavailable,capabilityGroups,
      speciesAbilities:speciesAbilityNames(speciesProfile).map(name=>abilitiesByName.get(normalizeAbilityName(name))?.name || name).join(", "),
      ownedAbilities:pokemon(actor) ? actor.items.filter(isAbilityItem).map(item=>({id:item.id,name:item.name})) : [],
      speciesCapabilities:speciesProfile?.capabilities.split(/\s+(?=(?:Combat|Narrative)\s*[-–:])/),
      orderTierValue:[5,10,20][tier(system.level,false) - 1],
      stats:Object.entries(stats).map(([key,label]) => ({key,label,value:system.stats[key]})),
      skills:skills.map((label,index) => ({index,label,rank:ranks.map((label,i) => ({label:pokemon(actor) ? `${i+1}d6` : label,value:i+1,selected:system.skills[`s${index}`] === i+1}))})),
      stages:Object.entries(stats).filter(([key])=>key!=="hp").map(([key,label])=>({
        key,label,current:system.stages[key],defaultStage:system.defaultStages[key],effective:combatStat(actor,key)
      })),
      effectiveMovement:Math.max(0,Math.floor((system.movement + Math.trunc(system.stages.spe / 2)) / (afflicted(actor,"slowed") ? 2 : 1))),
      potionEffects:Object.entries(system.potionBonuses).filter(([,value])=>value).map(([key,value])=>({label:potionVariants[key],value})),
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
      walletBalance:actor.type === "trainer" ? formatMoney(system.money) : null,
      walletHistory:(system.walletHistory || "").split("\n").filter(Boolean),
      roles:pokemon(actor) ? actor.items.filter(isRoleItem).map(item=>({
        id:item.id,name:item.name,startingStats:catalogListing(item).startingStats
      })) : [],
      rankOneUnlocked:system.level >= 10,
      pools,battleSlots:pokemon(actor) ? battleSlotsUsed(actor) : null,trainerCap:trainer ? pokemonLevelCap(trainer.system.level) : null,
      panels:[["profile","Profile"],["bag","Bag"],["team","Team"],["skills","Skills"]]
        .map(([key,label])=>({key,label,active:key === this.activePanel})),
      profileActive:this.activePanel === "profile",bagActive:this.activePanel === "bag",
      teamActive:this.activePanel === "team",skillsActive:this.activePanel === "skills",
      profileGroups:groups.filter(onProfile),bagGroups:groups.filter(group=>group.type === "gear"),
      moveGroups:groups.filter(group=>group.type === "move")
    };
  }
}

class PTEItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {classes:["pte","pte-item"], tag:"form",position:{width:550,height:"auto"},form:{submitOnChange:true,closeOnSubmit:false}};
  static PARTS = {body:{template:`${root}/templates/item.hbs`}};
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const listing = catalogListing(item);
    const variants = Object.keys(boostListing(item) || maladyListing(item) || {}).map(value=>({value,label:potionVariants[value] || afflictions[value],selected:item.system.variant===value}));
    const description = itemDescription(item,listing);
    const [sourceName,pageNumber] = item.system.source.split(", p. ");
    const sourceKey = Object.keys(books).find(key => books[key] === sourceName ||
      (key === "occultism" && sourceName === "Path of Occultism (draft)"));
    const sourceLink = item.system.source.startsWith("PTE Attacks & Ability Reference, ") ? attackReference : sourceKey && /^\d+$/.test(pageNumber) ? bookLink(sourceKey,Number(pageNumber)) : "";
    return {...context,item,system:item.system,price:item.type === "gear" ? gearPrice(item) : "",
      sourceLink,description,variants,variableDb:item.system.variableDb || listing?.stats?.variableDb,pokemonMove:item.type === "move" && item.parent?.type === "pokemon",prerequisites:listing?.prerequisites,keywords:listing?.keywords, tierName:listing?.tier, requirements:listing?.requirements, versatile:listing?.versatile,
      frequency:item.system.frequency || listing?.frequency,action:item.system.action || listing?.action,
      priceNote:listing?.priceNote,pricePage:listing?.pricePage,editable:this.isEditable,move:item.type === "move",gear:item.type === "gear",feature:item.type === "feature",
      categories:choices(["Physical","Special","Status","WT"],item.system.category),
      elements:choices(["",...types],item.system.element)};
  }
}

class Dex extends HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = {classes:["pte","pte-dex"],position:{width:580,height:580},window:{title:"Pokédex",resizable:true},
    actions:{profile(event,target) { return showProfile(Number(target.dataset.page)); }, async importEntry(event,target) {
      const entry = this.entries.find(row => row.page === Number(target.dataset.page));
      if (!entry) return;
      const system = {species:entry.name,dexPage:entry.page,stats:entry.stats,type1:entry.types[0] ?? "",type2:entry.types[1] ?? ""};
      const art = await tokenArtwork(entry.page);
      if (this.destination?.isOwner) {
        system.health = {value:maxHP(this.destination.system.level,entry.stats.hp,true)};
        await this.destination.update({system,...(art ? {img:art,"prototypeToken.texture.src":art} : {})});
      } else {
        if (!game.user.can("ACTOR_CREATE")) return ui.notifications.warn("You need permission to create an Actor.");
        const actor = await Actor.create({type:"pokemon",name:entry.name,system,items:startingMoveData(entry),
          ...(art ? {img:art,prototypeToken:{texture:{src:art}}} : {})});
        actor?.sheet.render({force:true});
      }
    }}
  };
  static PARTS = {body:{template:`${root}/templates/dex.hbs`}};
  constructor({destination,...options} = {}) {
    super(options);
    this.destination = destination;
  }
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.entries ??= await dex();
    return {...context,entries:this.entries.map(entry => ({...entry,typing:entry.types.join(" / "),moves:entry.starting.join(", ")})),applying:Boolean(this.destination)};
  }
  _onRender(context,options) {
    super._onRender(context,options);
    const input = this.element.querySelector("input[type=search]");
    input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      for (const row of this.element.querySelectorAll("[data-search]")) row.hidden = !row.dataset.search.toLowerCase().includes(query);
    });
  }
}

Hooks.once("init", () => {
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
  game.settings.register(ID,"token-directory",{name:"Pokémon PNG folder",
    hint:"Foundry Data folder containing the extracted page-number PNGs.",scope:"world",config:true,type:String,default:"pte-tokens"});
  game.pte = {openDex:() => new Dex().render({force:true}),openBooks:showBooks};
});

Hooks.on("updateActor", (actor, changes) => {
  if (actor.type !== "trainer" || !changes.system?.partnerActions) return;
  for (const partner of game.actors.filter(candidate => linkedTrainer(candidate)?.id === actor.id)) {
    if (partner.sheet?.rendered) partner.sheet.render();
  }
});
