import assert from "node:assert/strict";
import {access,readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {ClassicLevel} from "classic-level";
import Handlebars from "handlebars";
import {weaponPresets} from "../data/weapon-presets.mjs";
import {effectiveness,skills} from "../scripts/rules.mjs";
import {itemKeywords,itemSlotUsage} from "../data/item-slots.mjs";
import {speciesArtworkFiles} from "../data/token-art.mjs";

import {campaignTimeForDate,darknessAt,weatherPreset,sceneParticleWeather} from "../scripts/campaign-time.mjs";

assert.equal(darknessAt(campaignTimeForDate("2000-01-01T12:00")),0);
assert.equal(darknessAt(campaignTimeForDate("2000-01-01T00:00")),.98);
assert.ok(darknessAt(campaignTimeForDate("2000-01-01T18:00")) > .08);
assert.equal(weatherPreset(["Sunny","Rainy"],{rain:"Rain",snow:"Snow"}),"rain");
assert.equal(weatherPreset(["Snowy","Sandstorm"],{snow:"Snow"}),"snow");
assert.equal(weatherPreset([], {rain:"Rain"}),"");

assert.deepEqual(sceneParticleWeather(true, ["Windy","Rainy"], ""), ["Windy","Rainy"]);
assert.deepEqual(sceneParticleWeather(false, ["Windy"], "pte-rain"), ["Rainy"]);
assert.deepEqual(sceneParticleWeather(false, ["Rainy"], ""), []);
assert.deepEqual(sceneParticleWeather(true, ["Sunny","Windy"], ""), ["Sunny","Windy"]);
assert.deepEqual(sceneParticleWeather(false, [], "pte-sun"), ["Sunny"]);
const root = new URL("../",import.meta.url);
const read = path => readFile(new URL(path,root),"utf8");
const manifest = JSON.parse(await read("system.json"));
const hooks = new Map();
const sheets = new Map();
class Sheet {
  constructor(document) { this.document = document; this.isEditable = true; }
  async _prepareContext() { return {}; }
}
class Field { constructor(options) { this.initial = options?.initial; } }
class SchemaField { constructor(fields) { this.fields = fields; } }
const registerHook = (name,callback)=>hooks.set(name,callback);
globalThis.foundry = {
  abstract:{TypeDataModel:class {}},
  data:{fields:{NumberField:Field,StringField:Field,BooleanField:Field,SchemaField}},
  applications:{api:{HandlebarsApplicationMixin:base=>base,ApplicationV2:Sheet},
    sheets:{ActorSheetV2:Sheet,ItemSheetV2:Sheet},
    apps:{DocumentSheetConfig:{registerSheet:(document,id,sheet)=>sheets.set(document,sheet)}}},
  documents:{Actor:class {},Item:class {},ChatMessage:class {}},
  dice:{Roll:class {}},helpers:{Hooks:{on:registerHook,once:registerHook}}
};
globalThis.CONFIG = {ui:{combat:class {}},Actor:{dataModels:{}},Item:{dataModels:{}}};
const actors = [];
globalThis.game = {actors,settings:{register() {}}};
actors.get = id=>actors.find(actor=>actor.id === id);
await import("../scripts/pte.mjs");
hooks.get("init")();
const controls = {tokens:{tools:{}}};
hooks.get("getSceneControlButtons")(controls);
assert.equal(typeof controls.tokens.tools["pte-campaign-time"].onChange,"function");
await access(new URL("templates/campaign-time.hbs",root));

function defaults(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key,field])=>
    [key,field.fields ? defaults(field.fields) : field.initial]));
}
function item(type,name,fields = {}) {
  const system = {...defaults(CONFIG.Item.dataModels[type].defineSchema()),...fields};
  return {type,name,system,id:name,getFlag:()=>undefined,toObject:()=>({_id:name,type,name,system})};
}
function actor(type,items) {
  items.contents = [...items];
  return {type,items,system:defaults(CONFIG.Actor.dataModels[type].defineSchema()),
    name:type,id:type,isOwner:true,visible:true,getFlag:()=>undefined};
}

const potion = item("gear","Basic Healing Potion",{slotKeywords:"[ ] ,",quantity:4});
const armor = item("gear","Light Armor",{equipped:true});
const trainer = actor("trainer",[potion,armor]);
trainer.system.level = 5;
const pokemonActor = actor("pokemon",[]);
pokemonActor.system.trainerId = pokemonActor.id; // A stale or invalid trainer link.
actors.push(trainer,pokemonActor);
const actorTemplate = Handlebars.compile(await read("templates/actor.hbs"));
for (const creature of actors) {
  const sheet = new (sheets.get(foundry.documents.Actor))(creature);
  sheet.activePanel = "bag";
  const context = await sheet._prepareContext();
  assert.equal(context.skills.length,skills.length);
  assert.equal(context.slots.equipmentMax,creature === trainer ? 4 : 2);
  assert.match(actorTemplate(context),/Item Slots/);
}
assert.ok(itemKeywords(potion).has("small"));
assert.equal(itemSlotUsage(armor).equipped,2);
assert.equal(effectiveness("Fire",["Grass"]),1.5);

const itemTemplate = Handlebars.compile(await read("templates/item.hbs"));
for (const gear of [potion,armor]) {
  const sheet = new (sheets.get(foundry.documents.Item))(gear);
  assert.match(itemTemplate(await sheet._prepareContext()),/Item Size/);
}
Handlebars.precompile(await read("templates/dex.hbs"));

const profiles = JSON.parse(gunzipSync(await readFile(new URL("data/dex-profiles.json.gz",root))));
const dexPages = new Set(JSON.parse(await read("data/dex.json")).map(entry=>entry.page));
assert.equal(profiles.length,dexPages.size);
await Promise.all(profiles.flatMap(({page})=>{
  assert.ok(dexPages.has(page) && speciesArtworkFiles[page]);
  return ["Portraits","Ringed Tokens"].map(folder=>
    access(new URL(`assets/pte-tokens/${folder}/${speciesArtworkFiles[page]}`,root)));
}));
for (const path of [...manifest.esmodules,...manifest.styles]) await access(new URL(path,root));
for (const {name,path} of manifest.packs) {
  const db = new ClassicLevel(new URL(path,root).pathname,{valueEncoding:"json",createIfMissing:false});
  try {
    const entries = new Map(await db.iterator().all());
    assert.ok(entries.size,`Empty pack: ${name}`);
    for (const value of entries.values()) {
      if (value.folder) assert.ok(entries.has("!folders!" + value.folder),`Missing folder for ${value.name}`);
    }
    if (name === "gear") {
      const builds = [...entries.values()].filter(entry=>entry.flags?.[manifest.id]?.weaponPreset);
      assert.equal(builds.length,weaponPresets.size);
      for (const entry of builds) {
        assert.deepEqual(entry.system,weaponPresets.get(entry.flags[manifest.id].weaponPreset).gear.system);
      }
    }
  } finally { await db.close(); }
}
console.log(`Startup, actor and item sheet smoke tests, ${profiles.length} Pokédex profiles, and ${manifest.packs.length} packs passed.`);
