const HOUR = 3600;
const DAY = 24 * HOUR;
const EPOCH = Date.UTC(2000, 0, 1, 8) / 1000;
const PHASES = [
  {label: "Midnight", hour: 0, range: "00:00–08:00"},
  {label: "Morning", hour: 8, range: "08:00–12:00"},
  {label: "Afternoon", hour: 12, range: "12:00–16:00"},
  {label: "Evening", hour: 16, range: "16:00–20:00"},
  {label: "Night", hour: 20, range: "20:00–24:00"}
];
const WEATHER_TYPES = ["Windy", "Foggy", "Mystical", "Sunny", "Snowy", "Rainy", "Thunderstorm", "Sandstorm"];
const WEATHER_FLAG = "fieldWeather";
const TIMER = "campaignTimer";
const LIGHTING = "clockLighting";
const FOLLOW_WEATHER = "clockWeather";
const RATES = [1, 10, 60, 240];
const LIGHT_LEVELS = [[0,.9],[5,.9],[8,.15],[12,0],[16,.08],[20,.8],[24,.9]];
const PRESETS = {
  Windy: /wind|leav/i, Foggy: /fog|mist/i, Snowy: /snow|blizzard/i,
  Rainy: /rain/i, Thunderstorm: /rainstorm|thunder|storm|rain/i, Sandstorm: /sand|dust/i,
  Mystical: /mystic|sparkle|ember/i
};

export function darknessAt(worldTime) {
  const dayTime = ((EPOCH + worldTime) % DAY + DAY) % DAY / HOUR;
  const end = LIGHT_LEVELS.findIndex(([hour]) => hour > dayTime);
  const [startHour,startLevel] = LIGHT_LEVELS[end - 1];
  const [endHour,endLevel] = LIGHT_LEVELS[end];
  const progress = (dayTime - startHour) / (endHour - startHour);
  return Math.round((startLevel + (endLevel - startLevel) * progress) * 50) / 50;
}

export function weatherPreset(conditions, presets) {
  for (const condition of [...conditions].reverse()) {
    const match = PRESETS[condition];
    const name = match && Object.keys(presets).find(key => match.test(key));
    if (name) return name;
  }
  return "";
}

function normalizeWeather(weather) {
  return Array.isArray(weather) ? [...new Set(weather.filter(type => WEATHER_TYPES.includes(type)))].slice(-2) : [];
}

export function changeFieldWeather(weather, action, type) {
  const current = normalizeWeather(weather);
  if (action === "clear") return [];
  if (!WEATHER_TYPES.includes(type)) return current;
  const remaining = current.filter(entry => entry !== type);
  return action === "add" ? [...remaining, type].slice(-2) : remaining;
}

function viewedScene() {
  return globalThis.canvas?.scene ?? game.scenes?.viewed ?? game.scenes?.active;
}

const formatMonth = new Intl.DateTimeFormat("en", {month: "long", year: "numeric", timeZone: "UTC"});
const formatDate = new Intl.DateTimeFormat("en", {weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC"});

export function campaignDate(worldTime) {
  return new Date((EPOCH + worldTime) * 1000);
}

export function campaignTimeForDate(value) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) return NaN;
  const date = new Date(`${value}:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,16) !== value) return NaN;
  return date.getTime() / 1000 - EPOCH;
}

export function timePhase(worldTime) {
  const hour = campaignDate(worldTime).getUTCHours();
  return PHASES.findLast(phase => phase.hour <= hour);
}

export function secondsToNextPhase(worldTime) {
  const dayTime = ((EPOCH + worldTime) % DAY + DAY) % DAY;
  return (PHASES.find(phase => phase.hour * HOUR > dayTime)?.hour * HOUR || DAY) - dayTime;
}

export function monthCalendar(date, offset = 0) {
  const month = new Date(date);
  month.setUTCDate(1);
  month.setUTCMonth(month.getUTCMonth() + offset);
  const last = new Date(month);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const cells = Array.from({length: month.getUTCDay()}, () => ({}));
  const isCurrent = month.getUTCFullYear() === date.getUTCFullYear() && month.getUTCMonth() === date.getUTCMonth();
  for (let day = 1; day <= last.getUTCDate(); day++) cells.push({day, current: isCurrent && day === date.getUTCDate()});
  return {label: formatMonth.format(month), cells};
}

export function registerCampaignClock(systemId) {
  const {Hooks} = foundry.helpers;
  const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

  let lastTick;
  let carry = 0;
  let timeBusy = false;
  let lightingBusy = false;
  let lightingPending = false;
  const isActiveGM = () => game.user?.isGM && game.users.activeGM?.id === game.user.id;
  const timer = () => game.settings.get(systemId, TIMER);
  game.settings.register(systemId, TIMER, {
    scope: "world", config: false, type: Object, default: {running: false, rate: 60},
    onChange: () => {
      lastTick = undefined;
      carry = 0;
      if (clock?.rendered) clock.render();
    }
  });

  async function advance(seconds) {
    if (timeBusy) return false;
    timeBusy = true;
    try {
      await game.time.advance(seconds);
      return true;
    } finally {
      timeBusy = false;
    }
  }

  async function tick() {
    if (!isActiveGM() || !timer().running) {
      lastTick = undefined;
      carry = 0;
      return;
    }
    const now = performance.now();
    const rate = RATES.includes(timer().rate) ? timer().rate : 60;
    carry += (lastTick === undefined ? 0 : (now - lastTick) / 1000) * rate;
    lastTick = now;
    const seconds = Math.floor(carry);
    if (!seconds || timeBusy) return;
    carry -= seconds;
    try {
      await advance(seconds);
    } catch (error) {
      console.error("PTE campaign timer could not advance", error);
      await game.settings.set(systemId, TIMER, {running: false, rate});
    }
  }

  async function syncLighting() {
    if (!isActiveGM()) return;
    lightingPending = true;
    if (lightingBusy) return;
    lightingBusy = true;
    try {
      while (lightingPending && isActiveGM()) {
        lightingPending = false;
        const level = darknessAt(game.time.worldTime);
        for (const scene of game.scenes) {
          if (!scene.getFlag(systemId, LIGHTING) || scene.environment.darknessLevelLock ||
              scene.environment.darknessLevel === level) continue;
          await scene.update({"environment.darknessLevel": level}, {animateDarkness: 1000});
        }
      }
    } catch (error) {
      console.error("PTE campaign clock could not update scene lighting", error);
    } finally {
      lightingBusy = false;
    }
  }

  class CampaignClock extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: "pte-system-campaign-time",
      classes: ["pte-campaign-time-window"],
      position: {width: 510},
      window: {title: "Campaign Clock & Calendar", resizable: true},
      actions: {
        previousMonth() { this.monthOffset--; return this.render(); },
        nextMonth() { this.monthOffset++; return this.render(); },
        currentMonth() { this.monthOffset = 0; return this.render(); },
        advanceTime(event, button) { return this.moveTime(Number(button.dataset.seconds)); },
        async toggleTimer() {
          if (!game.user.isGM) return;
          await game.settings.set(systemId, TIMER, {...timer(), running: !timer().running});
        },
        async setRate() {
          if (!game.user.isGM) return;
          const rate = Number(this.element.querySelector('[name="clockRate"]').value);
          if (RATES.includes(rate)) await game.settings.set(systemId, TIMER, {...timer(), rate});
        },
        async toggleLighting() {
          const scene = this.sceneForEdit();
          if (!scene) return;
          const enabled = !scene.getFlag(systemId, LIGHTING);
          if (enabled && scene.environment.darknessLevelLock) {
            return ui.notifications.warn("Unlock Darkness Level in the scene settings first.");
          }
          await scene.update({
            [`flags.${systemId}.${LIGHTING}`]: enabled,
            ...(enabled ? {"environment.darknessLevel": darknessAt(game.time.worldTime)} : {})
          }, {animateDarkness: 1000});
        },
        async setVisualWeather() {
          const scene = this.sceneForEdit();
          if (!scene) return;
          const value = this.element.querySelector('[name="visualWeather"]').value;
          const presets = CONFIG.weatherEffects ?? {};
          if (value !== "follow" && value && !Object.hasOwn(presets, value)) return;
          const follow = value === "follow";
          await scene.update({
            [`flags.${systemId}.${FOLLOW_WEATHER}`]: follow,
            weather: follow ? weatherPreset(normalizeWeather(scene.getFlag(systemId, WEATHER_FLAG)), presets) : value
          });
        },
        nextPhase() { return this.moveTime(secondsToNextPhase(game.time.worldTime)); },
        addWeather() {
          return this.updateWeather("add", this.element.querySelector('[name="weatherType"]').value);
        },
        removeWeather(event, button) { return this.updateWeather("remove", button.dataset.weather); },
        clearWeather() { return this.updateWeather("clear"); },
        setTime() {
          const value = this.element.querySelector('input[name="campaignTime"]').value;
          const target = campaignTimeForDate(value);
          if (!Number.isFinite(target)) return ui.notifications.warn("Enter a valid campaign date and time.");
          return this.moveTime(target - game.time.worldTime);
        }
      }
    };

    static PARTS = {body: {template: `systems/${systemId}/templates/campaign-time.hbs`, scrollable: [""]}};
    monthOffset = 0;
    updating = false;
    updatingWeather = false;

    async _prepareContext(options) {
      const now = campaignDate(game.time.worldTime);
      const phase = timePhase(game.time.worldTime);
      const scene = viewedScene();
      const weather = normalizeWeather(scene?.getFlag(systemId, WEATHER_FLAG));
      return {
        ...await super._prepareContext(options),
        dateLabel: formatDate.format(now),
        time: now.toISOString().slice(11, 19),
        inputTime: now.toISOString().slice(0, 16),
        calendar: monthCalendar(now, this.monthOffset),
        phases: PHASES.map(entry => ({...entry, active: entry === phase})),
        phase: phase.label,
        scene: scene?.name,
        sceneId: scene?.id,
        weather,
        weatherTypes: WEATHER_TYPES,
        lighting: Boolean(scene?.getFlag(systemId, LIGHTING)),
        timerRunning: timer().running,
        rates: RATES.map(rate => ({rate, selected: rate === timer().rate})),
        followWeather: Boolean(scene?.getFlag(systemId, FOLLOW_WEATHER)),
        visualPresets: Object.entries(CONFIG.weatherEffects ?? {}).map(([key, config]) => ({
          key, name: game.i18n.localize(config.label ?? key),
          selected: !scene?.getFlag(systemId, FOLLOW_WEATHER) && scene?.weather === key
        })),
        isGM: game.user.isGM
      };
    }

    sceneForEdit() {
      if (!game.user.isGM) return;
      const scene = viewedScene();
      const renderedSceneId = this.element.querySelector("[data-weather-scene]")?.dataset.weatherScene;
      return scene?.id === renderedSceneId ? scene : undefined;
    }

    async updateWeather(action, type) {
      const scene = this.sceneForEdit();
      if (!scene || this.updatingWeather) return;
      this.updatingWeather = true;
      try {
        const current = scene.getFlag(systemId, WEATHER_FLAG);
        const weather = changeFieldWeather(current, action, type);
        const follow = scene.getFlag(systemId, FOLLOW_WEATHER);
        await scene.update({
          [`flags.${systemId}.${WEATHER_FLAG}`]: weather,
          ...(follow ? {weather: weatherPreset(weather, CONFIG.weatherEffects ?? {})} : {})
        });
      } catch (error) {
        console.error("PTE campaign clock could not update weather", error);
        ui.notifications.error("Could not update the scene’s weather.");
      } finally {
        this.updatingWeather = false;
      }
    }

    async moveTime(seconds) {
      if (!game.user.isGM || timeBusy || this.updating || !Number.isFinite(seconds) || seconds === 0) return;
      const next = campaignDate(game.time.worldTime + seconds);
      if (!Number.isFinite(next.getTime()) || next.getUTCFullYear() < 1 || next.getUTCFullYear() > 9999) {
        return ui.notifications.warn("Choose a campaign year between 1 and 9999.");
      }
      this.updating = true;
      const previousMonth = this.monthOffset;
      this.monthOffset = 0;
      try {
        await advance(seconds);
      } catch (error) {
        this.monthOffset = previousMonth;
        console.error("PTE campaign clock could not update time", error);
        ui.notifications.error("Could not update campaign time.");
      } finally {
        this.updating = false;
      }
    }
  }

  let clock;
  let lastDisplayKey;
  Hooks.once("ready", () => {
    setInterval(() => {
      if (game.user.isGM) void tick().catch(error => console.error("PTE campaign timer", error));
    }, 1000);
    void syncLighting();
  });
  Hooks.on("updateWorldTime", time => {
    void syncLighting();
    if (!clock?.rendered) return;
    const iso = campaignDate(time).toISOString();
    const key = iso.slice(0, 10) + timePhase(time).label;
    if (key !== lastDisplayKey) {
      lastDisplayKey = key;
      return clock.render();
    }
    const readout = clock.element.querySelector(".pte-clock-time");
    if (readout) readout.textContent = iso.slice(11, 19);
  });
  Hooks.on("updateScene", (scene, changes) => {
    if (clock?.rendered && scene.id === viewedScene()?.id &&
        (changes.flags?.[systemId] || "weather" in changes || "name" in changes)) return clock.render();
  });
  Hooks.on("canvasReady", () => {
    if (clock?.rendered) return clock.render();
  });
  return () => (clock ??= new CampaignClock()).render({force: true});
}
