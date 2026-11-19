import {catalog} from "../data/catalog.mjs";
import {TrainerData, PokemonData, MoveData, GearData, FeatureData} from "./models.mjs";
import {stats, skills, ranks, types, effectiveness, tier, maxHP, evasion, successes, damageFormula} from "./rules.mjs";

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
const pokemon = actor => actor.type === "pokemon";
const linkedTrainer = actor => pokemon(actor) && game.actors.get(actor.system.trainerId);
const elements = actor => pokemon(actor) ? [...new Set([actor.system.type1,actor.system.type2].filter(Boolean))] : [];
const dex = () => fetch(foundry.utils.getRoute(`${root}/data/dex.json`)).then(response => {
  if (!response.ok) throw new Error("Could not load the Pokédex.");
  return response.json();
});

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
      const {level = 1, stats: scores = {hp: 5}} = this.system;
      this.updateSource({"system.health.value":maxHP(level, scores.hp, pokemon(this))});
    }
    if (data.prototypeToken?.bar1?.attribute == null) {
      this.updateSource({"prototypeToken.bar1.attribute":"health"});
    }
  }
}

async function skill(actor, index) {
  const rank = actor.system.skills[`s${index}`];
  const args = await DialogV2.prompt({
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

async function useMove(actor, item) {
  if (actor.system.health.value <= 0) return ui.notifications.warn("This combatant has fainted.");
  const move = item.system;
  const roll = await new Roll("1d20 + @accuracy", {accuracy:actor.system.accuracy}).evaluate();
  const natural = roll.dice[0].values[0];
  const critical = move.category !== "Status" && natural >= move.crit;
  const special = move.category === "Special";
  const db = move.db + (elements(actor).includes(move.element) ? 2 : 0);
  const damage = move.category === "Status" || move.db === 0 ? null :
    await new Roll(damageFormula(db, critical, actor.system.stats[special ? "spa" : "atk"], move.damage)).evaluate();
  const targets = [...game.user.targets].filter(token => token.actor);
  const lines = targets.map(token => {
    const target = token.actor;
    const defense = move.category === "Status" ? 0 : target.system.stats[special ? "spd" : "def"];
    const targetEvasion = Math.max(evasion(defense),evasion(target.system.stats.spe)) + target.system.evasion;
    const needed = move.ac + targetEvasion;
    const factor = damage ? effectiveness(move.element,elements(target)) : 1;
    const result = !factor ? "Immune" : roll.total < needed ? "Miss" : !damage ? "Hit" :
      `Hit · ${Math.floor(Math.max(0, damage.total - defense - target.system.reduction) * factor)} damage (×${factor})`;
    return `<li>${escape(token.name)} · TN ${needed} · ${result}</li>`;
  });
  const range = [move.element,move.category,move.range,move.frequency,move.action].map(escape).join(" · ");
  await roll.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor:
    `<strong>${escape(item.name)}</strong><br>${range}<br>AC ${move.ac}${critical ? " · Critical" : ""}
      ${damage ? ` · DB ${db} · Raw damage ${damage.total} (${escape(damage.formula)})` : ""}
      ${lines.length ? `<ul>${lines.join("")}</ul>` : ""}<p>${escape(move.description)}</p>`});
}

const itemTypes = {move:"Moves",gear:"Bag",feature:"Features",class:"Classes"};

async function pickCatalogEntry(type) {
  const groups = Object.groupBy(catalog.map((entry, index) => ({...entry,index}))
    .filter(entry => entry.kind === type), entry => entry.category);
  const options = Object.entries(groups).map(([label,entries]) =>
    `<optgroup label="${escape(label)}">${entries.map(entry =>
      `<option value="${entry.index}">${escape(entry.name)} · p. ${entry.page}</option>`
    ).join("")}</optgroup>`
  ).join("");
  const selection = await DialogV2.prompt({
    window:{title:`Add ${titleCase(type)}`},
    content:`<label>Catalog <select name="entry"><option value="custom">Custom ${escape(type)}</option>${options}</select></label>`,
    ok:{label:"Add",callback:(event,button) => new FormData(button.form).get("entry")},
    rejectClose:false
  });
  if (selection == null) return null;
  if (selection === "custom") return {name:`New ${titleCase(type)}`,type};
  const entry = catalog[Number(selection)];
  if (entry?.kind !== type) return null;
  return {name:entry.name,type,system:{source:`${entry.book}, p. ${entry.page}`,
    description:`${entry.category}. See the cited page for prerequisites and effects.`}};
}

class PTESheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes:["pte","pte-actor"], tag:"form", position:{width:760,height:815}, window:{resizable:true},
    form:{submitOnChange:true,closeOnSubmit:false},
    actions:{
      skill(event, target) { return skill(this.document, Number(target.dataset.index)); },
      save() { return new Roll("1d20").toMessage({speaker:ChatMessage.getSpeaker({actor:this.document}),flavor:"Affliction Save · 15+"}); },
      luck() { return new Roll("1d20").toMessage({speaker:ChatMessage.getSpeaker({actor:this.document}),flavor:"Luck Check"}); },
      move(event,target) { return useMove(this.document,this.document.items.get(target.dataset.id)); },
      open(event,target) { return this.document.items.get(target.dataset.id)?.sheet.render({force:true}); },
      async add(event,target) {
        const type = target.dataset.type;
        if (!this.isEditable || !Object.hasOwn(itemTypes,type)) return;
        if (type === "class" && pokemon(this.document)) return;
        const data = type === "move" ? {name:"New Move",type} : await pickCatalogEntry(type);
        if (!data) return;
        const [item] = await this.document.createEmbeddedDocuments("Item",[data]);
        item?.sheet.render({force:true});
      },
      async remove(event,target) {
        const item = this.document.items.get(target.dataset.id);
        if (item && await DialogV2.confirm({window:{title:"Remove Item"},content:`<p>Remove ${escape(item.name)}?</p>`,rejectClose:false})) await item.delete();
      },
      equip(event,target) {
        const item = this.document.items.get(target.dataset.id);
        return item?.update({"system.equipped":!item.system.equipped});
      },
      async spendAction(event,target) {
        const actor = this.document;
        const trainer = linkedTrainer(actor);
        const pool = trainer || actor;
        if (!pool.isOwner) return ui.notifications.warn("Only a Trainer owner or the GM can change this action pool.");
        const name = trainer || target.dataset.pool === "team" ? "partnerActions" : "actions";
        const path = `system.${name}.${target.dataset.key}`;
        await pool.update({[path]:!pool.system[name][target.dataset.key]});
      },
      async refreshActions(event,target) {
        const actor = this.document;
        const trainer = linkedTrainer(actor);
        const pool = trainer || actor;
        if (!pool.isOwner) return;
        const name = trainer || target.dataset.pool === "team" ? "partnerActions" : "actions";
        await pool.update(Object.fromEntries(actions.map(key => [`system.${name}.${key}`,false])));
      },
      heal() { return this.document.update({"system.health.value":this.document.system.health.max,"system.health.temp":0}); },
      async damage() {
        const amount = await DialogV2.prompt({window:{title:"Apply Final Damage"},content:'<label>Damage <input name="amount" type="number" min="0" required></label>',
          ok:{label:"Apply",callback:(event,button) => Number(new FormData(button.form).get("amount"))},rejectClose:false});
        if (!(amount > 0)) return;
        const {temp,value} = this.document.system.health;
        return this.document.update({"system.health.temp":Math.max(0,temp-amount),"system.health.value":Math.max(0,value-Math.max(0,amount-temp))});
      },
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
    const pools = trainer ? [pool("Shared Pokémon Actions","team",trainer)] : [pool(pokemon(actor) ? "Round Actions" : "Trainer Actions","own",actor)];
    if (!pokemon(actor)) pools.push(pool("Shared Pokémon Actions","team",actor));
    return {...context, actor, system, editable:this.isEditable, pokemon:pokemon(actor), tier:tier(system.level,pokemon(actor)),
      stats:Object.entries(stats).map(([key,label]) => ({key,label,value:system.stats[key]})),
      skills:skills.map((label,index) => ({index,label,rank:ranks.map((label,i) => ({label,value:i+1,selected:system.skills[`s${index}`] === i+1}))})),
      evasion:[system.stats.def,system.stats.spd,system.stats.spe].map(evasion).join(" / "),
      type1:choices(["",...types],system.type1),type2:choices(["",...types],system.type2),
      trainers:game.actors.filter(a => a.type === "trainer" && a.visible).map(a => ({name:a.name,id:a.id,selected:a.id === system.trainerId})),
      partners:game.actors.filter(a => pokemon(a) && a.visible && a.system.trainerId === actor.id),
      pools,
      groups:Object.entries(itemTypes).filter(([type]) => type !== "class" || !pokemon(actor)).map(([type,label]) => ({type,label,items:actor.items.filter(i => i.type === type).map(i => ({
        id:i.id,name:i.name,move:type === "move",gear:type === "gear",system:i.system
      }))}))
    };
  }
}

class PTEItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {classes:["pte","pte-item"], tag:"form",position:{width:550,height:"auto"},form:{submitOnChange:true,closeOnSubmit:false}};
  static PARTS = {body:{template:`${root}/templates/item.hbs`}};
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    return {...context,item,system:item.system,editable:this.isEditable,move:item.type === "move",gear:item.type === "gear",feature:item.type === "feature",
      categories:choices(["Physical","Special","Status"],item.system.category),
      elements:choices(["",...types],item.system.element)};
  }
}

class Dex extends HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = {classes:["pte","pte-dex"],position:{width:580,height:580},window:{title:"Pokédex",resizable:true},
    actions:{async importEntry(event,target) {
      const entry = this.entries.find(row => row.page === Number(target.dataset.page));
      if (!entry) return;
      const system = {species:entry.name,dexPage:entry.page,stats:entry.stats,type1:entry.types[0] ?? "",type2:entry.types[1] ?? ""};
      if (this.destination?.isOwner) {
        system.health = {value:maxHP(this.destination.system.level,entry.stats.hp,true)};
        await this.destination.update({system});
      } else {
        if (!game.user.can("ACTOR_CREATE")) return ui.notifications.warn("You need permission to create an Actor.");
        const actor = await Actor.create({type:"pokemon",name:entry.name,system});
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
  game.pte = {openDex:() => new Dex().render({force:true})};
});

Hooks.on("updateActor", (actor, changes) => {
  if (actor.type !== "trainer" || !changes.system?.partnerActions) return;
  for (const partner of game.actors.filter(candidate => linkedTrainer(candidate)?.id === actor.id)) {
    if (partner.sheet?.rendered) partner.sheet.render();
  }
});
