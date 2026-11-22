import maneuvers from "../data/maneuvers.json" with {type:"json"};

export {maneuvers};

export function riposteDamageResult(incoming, raw, boosted, attackerMaxHP) {
  const counter = boosted ? Math.floor(raw * 1.5) : raw;
  return {
    counter,
    remaining:Math.max(0,incoming - counter),
    hpLoss:boosted ? Math.min(Math.max(0,counter - incoming),3 * Math.floor(attackerMaxHP / 10)) : 0
  };
}
