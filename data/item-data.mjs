import {classEffects} from "./class-effects.mjs";
import {referenceEffects} from "./effects.mjs";

export const entrySource = entry => entry.source || `${entry.book}, p. ${entry.page}`;
export const linkedEffectPlaceholder = "See the linked reference for this entry’s effects.";
export const classEffect = entry => classEffects[[entry.kind,entry.book,entry.page,entry.name].join("|")];
export const catalogEffect = entry => classEffect(entry) || referenceEffects[entrySource(entry)] || entry.rules;
export const categoryEffectPlaceholder = entry => `${entry.category}. See the cited page for prerequisites and effects.`;

export function catalogItemData(entry) {
  return {name:entry.name,type:entry.kind,system:{source:entrySource(entry),
    ...entry.stats,
    ...(entry.price ? {price:entry.price} : {}),
    ...(entry.frequency ? {frequency:entry.frequency} : {}),
    ...(entry.action ? {action:entry.action} : {}),
    description:catalogEffect(entry) || (entry.source ? linkedEffectPlaceholder : categoryEffectPlaceholder(entry))}};
}
