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

export function registerCampaignClock(moduleId, weatherScope) {
  const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

  class CampaignClock extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: moduleId,
      classes: ["pte-campaign-time-module"],
      position: {width: 510},
      window: {title: "Campaign Clock & Calendar", resizable: true},
      actions: {
        previousMonth() { this.monthOffset--; return this.render(); },
        nextMonth() { this.monthOffset++; return this.render(); },
        currentMonth() { this.monthOffset = 0; return this.render(); },
        advanceTime(event, button) { return this.moveTime(Number(button.dataset.seconds)); },
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

    static PARTS = {body: {template: `modules/${moduleId}/templates/campaign-time.hbs`, scrollable: [""]}};
    monthOffset = 0;
    updating = false;
    updatingWeather = false;

    async _prepareContext(options) {
      const now = campaignDate(game.time.worldTime);
      const phase = timePhase(game.time.worldTime);
      const scene = viewedScene();
      const weather = normalizeWeather(scene?.getFlag(weatherScope, WEATHER_FLAG));
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
        isGM: game.user.isGM
      };
    }

    async updateWeather(action, type) {
      if (!game.user.isGM || this.updatingWeather) return;
      const scene = viewedScene();
      const renderedSceneId = this.element.querySelector("[data-weather-scene]").dataset.weatherScene;
      if (!scene || scene.id !== renderedSceneId) return;
      this.updatingWeather = true;
      try {
        const current = scene.getFlag(weatherScope, WEATHER_FLAG);
        await scene.setFlag(weatherScope, WEATHER_FLAG, changeFieldWeather(current, action, type));
      } catch (error) {
        console.error("PTE campaign clock could not update weather", error);
        ui.notifications.error("Could not update the scene’s weather.");
      } finally {
        this.updatingWeather = false;
      }
    }

    async moveTime(seconds) {
      if (!game.user.isGM || this.updating || !Number.isFinite(seconds) || seconds === 0) return;
      const next = campaignDate(game.time.worldTime + seconds);
      if (!Number.isFinite(next.getTime()) || next.getUTCFullYear() < 1 || next.getUTCFullYear() > 9999) {
        return ui.notifications.warn("Choose a campaign year between 1 and 9999.");
      }
      this.updating = true;
      const previousMonth = this.monthOffset;
      this.monthOffset = 0;
      try {
        await game.time.advance(seconds);
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
  Hooks.on("updateWorldTime", () => {
    if (clock?.rendered) return clock.render();
  });
  Hooks.on("updateScene", scene => {
    if (clock?.rendered && scene.id === viewedScene()?.id) return clock.render();
  });
  Hooks.on("canvasReady", () => {
    if (clock?.rendered) return clock.render();
  });
  return () => (clock ??= new CampaignClock()).render({force: true});
}
