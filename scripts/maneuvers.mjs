const combat = ["Combat","Athletics"];
const opposed = (acting, defending = acting) => ({acting,defending});

// Each cost option is a list of action slots spent together.
export const maneuvers = {
  defend:{name:"Defend",cost:[["swift"],["reaction"],["movement"]],target:true},
  disengage:{name:"Disengage",cost:[["movement"]]},
  help:{name:"Help",cost:[["swift"]],target:true},
  hide:{name:"Hide",cost:[["movement"]]},
  intercept:{name:"Intercept",cost:[["reaction"],["reaction","standard"]],target:true},
  jump:{name:"Jump",cost:[["movement"]]},
  respite:{name:"Respite",cost:[["standard","swift"]]},
  sprint:{name:"Sprint",cost:[["standard"],["swift"]]},
  riposte:{name:"Riposte",cost:[["standard","reaction"]],target:true,ac:4},
  analyze:{name:"Analyze",cost:[["swift"],[]],target:true},
  distract:{name:"Distract",cost:[["swift"]],target:true,ac:6,opposed:opposed(["Guile","Stealth"],["Focus","Perception"])},
  intrigue:{name:"Intrigue",cost:[["swift"]],target:true,ac:6,opposed:opposed(["Charm","Command"],["Focus","Intuition"])},
  provoke:{name:"Provoke",cost:[["swift"]],target:true,ac:2},
  terrorize:{name:"Terrorize",cost:[["swift"]],target:true,ac:6,opposed:opposed(["Command","Intimidate"],["Intimidate","Focus"])},
  opportunity:{name:"Attack of Opportunity",cost:[["reaction"]],target:true},
  disarm:{name:"Disarm",cost:[["swift"]],target:true,ac:4,opposed:opposed(["Combat","Stealth"])},
  grapple:{name:"Grapple",cost:[["standard"]],target:true,opposed:opposed(combat)},
  hinder:{name:"Hinder",cost:[["swift"]],target:true,ac:4,opposed:opposed(combat)},
  push:{name:"Push",cost:[["swift"],["movement"]],target:true,ac:2,opposed:opposed(combat)},
  throw:{name:"Throw",cost:[["standard"]],target:true,ac:4},
  trip:{name:"Trip",cost:[["standard"]],target:true,ac:4,opposed:opposed(["Combat","Acrobatics"])}
};

export function riposteDamageResult(incoming, raw, boosted, attackerMaxHP) {
  const counter = boosted ? Math.floor(raw * 1.5) : raw;
  return {
    counter,
    remaining:Math.max(0,incoming - counter),
    hpLoss:boosted ? Math.min(Math.max(0,counter - incoming),3 * Math.floor(attackerMaxHP / 10)) : 0
  };
}
