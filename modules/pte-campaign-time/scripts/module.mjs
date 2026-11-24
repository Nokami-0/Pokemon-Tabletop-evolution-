import {registerCampaignClock} from "./campaign-time.mjs";

const ID = "pte-campaign-time";
const PTE = "pokemon-tabletop-evolution";
let open;

Hooks.once("init", () => {
  // In PTE worlds, share the built-in system's existing scene weather.
  const weatherScope = game.system.id === PTE ? PTE : ID;
  open = registerCampaignClock(ID, weatherScope);
  game.modules.get(ID).api = {open};
});

Hooks.on("getSceneControlButtons", controls => {
  const tools = controls.tokens?.tools;
  if (!tools) return;
  tools[ID] = {
    name: ID,
    title: "Campaign Clock, Calendar & Weather",
    icon: "fa-solid fa-clock",
    order: Math.max(0, ...Object.values(tools).map(tool => tool.order ?? 0)) + 1,
    button: true,
    visible: true,
    onChange: () => open?.()
  };
});
