import {afflictions, conditions} from "./rules.mjs";

const {NumberField, StringField, BooleanField, SchemaField} = foundry.data.fields;
const count = (initial = 0, min = 0, max) => new NumberField({required:true, nullable:false, integer:true, initial, min, max});
const text = (initial = "") => new StringField({required:true, nullable:false, initial});
const keyset = (keys, field) => Object.fromEntries(keys.map(key => [key,field()]));
const actionFields = () => new SchemaField(keyset(["standard","swift","movement","reaction"], () => new BooleanField({initial:false})));

class CreatureData extends foundry.abstract.TypeDataModel {
  static defineSchema(baseHp = 5) {
    return {
      level:count(1,1),attackTurn:count(),attackScene:count(),
      basicAttack:new SchemaField({useScene:count(),lastUseTurn:count(-2,-2),sceneUses:count()}),
      stats:new SchemaField({hp:count(baseHp),...keyset(["atk","def","spa","spd","spe"],() => count(5))}),
      skills:new SchemaField(keyset(Array.from({length:17},(_,i) => `s${i}`),() => count(2,1,6))),
      afflictions:new SchemaField(keyset(Object.keys(afflictions),() => new BooleanField({initial:false}))),
      afflictionNotes:text(),
      conditions:new SchemaField(keyset(Object.keys(conditions),() => new BooleanField({initial:false}))),
      conditionNotes:text(),
      potionBonuses:new SchemaField(keyset(["crit","accuracy","evasion","save"],() => count())),
      healingPotionUsed:new BooleanField({initial:false}),
      stages:new SchemaField(keyset(["atk","def","spa","spd","spe"],() => count(0,-6,6))),
      defaultStages:new SchemaField(keyset(["atk","def","spa","spd","spe"],() => count(0,-6,6))),
      health:new SchemaField({value:count(),temp:count(),max:count()}),
      spirit:count(0,0,6),accuracy:count(0,-100),evasion:count(0,-100),reduction:count(),
      movement:count(6),capabilityNotes:text(),biography:text(),actions:actionFields()
    };
  }
}
export class TrainerData extends CreatureData {
  static defineSchema() {
    return {...super.defineSchema(10),money:count(),walletHistory:text(),trainerClass:text(),partnerActions:actionFields(),
      merits:count(),meritGoal:count(),levelPoints:count(),progressionHistory:text(),virtuosoSkill:text(),
      startingProgression:new BooleanField({initial:false}),
      levelAllocation:new SchemaField(keyset(["hp","atk","def","spa","spd","spe"],() => count()))};
  }
}
export class PokemonData extends CreatureData {
  static defineSchema() {
    return {...super.defineSchema(),species:text(),type1:text(),type2:text(),role:text(),trainerId:text(),dexPage:count(),xp:count(),levelPoints:count(),battleMoveLimit:count(6),
      levelAllocation:new SchemaField(keyset(["hp","atk","def","spa","spd","spe"],() => count()))};
  }
}
class ItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() { return {description:text(),source:text()}; }
}
export class MoveData extends ItemData {
  static defineSchema() {
    return {...super.defineSchema(),category:text("Physical"),element:text("Normal"),ac:count(2),accuracyRequired:new BooleanField({initial:true}),db:count(4,0,28),variableDb:text(),
      knownOnly:new BooleanField({initial:false}),slotExempt:new BooleanField({initial:false}),
      useScene:count(),lastUseTurn:count(-2,-2),sceneUses:count(),
      crit:count(20,1,20),damage:count(0,-100),range:text("Melee"),frequency:text("At-Will"),action:text("Standard")};
  }
}
export class GearData extends ItemData {
  static defineSchema() {
    return {...super.defineSchema(),quantity:count(1),price:text(),variant:text(),equipped:new BooleanField({initial:false})};
  }
}
export class FeatureData extends ItemData {
  static defineSchema() { return {...super.defineSchema(),frequency:text(),action:text()}; }
}
