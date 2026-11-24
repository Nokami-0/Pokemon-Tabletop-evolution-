const LABELS = {players: "Players", opponents: "Opponents"};
const FLAG = "sideInitiative";
const GROUP_COUNT = "partyGroupCount";

function combatantSide(combatant, systemId) {
  const assignedSide = combatant.getFlag(systemId, "combatSide");
  if (Object.hasOwn(LABELS, assignedSide)) return assignedSide;
  return combatant.actor?.hasPlayerOwner ? "players" : "opponents";
}

function initiativeGroup(member, systemId, state) {
  return state?.groups ? state.assignments[member.id] : combatantSide(member, systemId);
}

function readySides(combat, systemId, state) {
  return new Set(combat.combatants.filter(member => !member.isDefeated)
    .map(member => initiativeGroup(member, systemId, state)));
}

export function nextSideTurn(state, round, eligibleSides) {
  const currentIndex = state.order.indexOf(state.activeSide);
  const upcoming = state.order.slice(currentIndex + 1).find(side => eligibleSides.has(side));
  if (upcoming) return {round, state: {...state, activeSide: upcoming}};

  const first = state.order.find(side => eligibleSides.has(side));
  if (!first) return null;
  return {round: round + 1, state: {...state, activeSide: first, acted: []}};
}

export function registerTwoSideCombatTracker(systemId) {
  const BaseTracker = CONFIG.ui.combat;
  const template = `systems/${systemId}/templates/combat/two-side-tracker.hbs`;
  const statePath = `flags.${systemId}.${FLAG}`;
  const pending = new Set();

  class TwoSideCombatTracker extends BaseTracker {
    setupDrafts = new Map();

    async _onRender(context, options) {
      await super._onRender(context, options);
      const root = this.element;
      if (!root) return;

      const container = root.querySelector(":scope > .window-content") ?? root;
      const combat = this.viewed;
      const state = combat?.getFlag(systemId, FLAG);
      const oldPanel = container.querySelector(":scope > .pte-side-initiative");

      const isGM = game.user.isGM;
      const canManage = isGM && game.users.activeGM?.isSelf;
      const showSetup = canManage && combat && !combat.started && combat.combatants.size;
      const visibleMembers = combat?.combatants.filter(member => isGM || !member.hidden) ?? [];
      const groupCount = combat?.getFlag(systemId, GROUP_COUNT) ?? 2;
      const groupOptions = Array.from({length: groupCount}, (_, index) => ({
        id: `group-${index + 1}`, label: `Group ${index + 1}`
      }));
      const partyMembers = state ? [] : visibleMembers.map(member => ({
        id: member.id, name: member.name, hidden: member.hidden,
        groups: groupOptions.map(group => ({
          ...group, selected: group.id === (combatantSide(member, systemId) === "players" ? "group-1" : "group-2")
        }))
      }));
      const labels = state?.groups
        ? state.order.map(id => [id, state.groups[id]]) : Object.entries(LABELS);
      const sides = labels.map(([id, label]) => ({
        id, label,
        active: state?.activeSide === id,
        score: state?.scores[id],
        members: visibleMembers.filter(member => initiativeGroup(member, systemId, state) === id).map(member => ({
          id: member.id,
          name: member.name,
          hidden: member.hidden,
          defeated: member.isDefeated,
          done: state?.acted.includes(member.id),
          canMark: canManage && state?.activeSide === id && !member.isDefeated,
          otherSide: id === "players" ? LABELS.opponents : LABELS.players
        }))
      }));

      const panel = state || showSetup ? await foundry.applications.handlebars.renderTemplate(template, {
        sides, partyMembers, groupOptions, partyMode: Boolean(state?.groups),
        round: combat.round, running: Boolean(state), canManage,
        canStart: showSetup && readySides(combat, systemId).size === 2
      }) : null;

      // A render may have changed encounters while Handlebars was loading.
      if (this.element !== root || this.viewed !== combat ||
          combat?.getFlag(systemId, FLAG) !== state) return;

      oldPanel?.remove();
      container.classList.toggle("pte-side-initiative-active", Boolean(state));
      if (!panel) return;

      container.insertAdjacentHTML("afterbegin", panel);
      const section = container.firstElementChild;
      section.dataset.encounterId = combat.id;
      const details = section.querySelector("details");
      if (details) {
        const controls = Array.from(details.querySelectorAll("input, select"));
        const draft = this.setupDrafts.get(combat.id);
        if (draft) {
          details.open = draft.open;
          for (const control of controls) {
            if (draft.values.has(control.name)) control.value = draft.values.get(control.name);
          }
        }
        const mode = details.querySelector('[name="pte-initiative-mode"]');
        const syncSetup = () => {
          details.querySelector("[data-pte-side-setup]").hidden = mode.value === "party";
          details.querySelector("[data-pte-party-setup]").hidden = mode.value !== "party";
          const names = new Map(Array.from(details.querySelectorAll("[data-party-group]"), row => [
            row.dataset.partyGroup, row.querySelector("[data-party-label]").value.trim()
          ]));
          for (const option of details.querySelectorAll('select[name^="pte-party-member-"] option')) {
            option.textContent = names.get(option.value) || option.value;
          }
        };
        const saveDraft = () => this.setupDrafts.set(combat.id, {
          open: details.open, values: new Map(controls.map(control => [control.name, control.value]))
        });
        details.addEventListener("toggle", saveDraft);
        details.addEventListener("input", () => { syncSetup(); saveDraft(); });
        details.addEventListener("change", () => { syncSetup(); saveDraft(); });
        syncSetup();
      } else {
        this.setupDrafts.delete(combat.id);
      }
      section.addEventListener("click", async event => {
        const button = event.target.closest("button[data-side-action]");
        if (!button || !game.user.isGM || !game.users.activeGM?.isSelf ||
            this.viewed !== combat || pending.has(combat.id)) return;
        pending.add(combat.id);
        button.disabled = true;
        try {
          await this._handleSideAction(combat, section, button);
          if (this.viewed === combat && section.isConnected) await this.render();
        } catch (error) {
          console.error("PTE side initiative update failed", error);
          ui.notifications.error("Could not update side initiative. See the console for details.");
        } finally {
          pending.delete(combat.id);
          button.disabled = false;
        }
      });
    }

    async _handleSideAction(combat, panel, button) {
      const action = button.dataset.sideAction;
      const state = combat.getFlag(systemId, FLAG);
      const member = combat.combatants.get(button.dataset.memberId);

      if (action === "move" && member && !state && !combat.started) {
        const side = combatantSide(member, systemId);
        return member.setFlag(systemId, "combatSide", side === "players" ? "opponents" : "players");
      }

      if (!state && !combat.started && action === "add-group") {
        const count = combat.getFlag(systemId, GROUP_COUNT) ?? 2;
        return combat.setFlag(systemId, GROUP_COUNT, count + 1);
      }

      if (!state && !combat.started && action === "start-party") {
        const groups = Object.fromEntries(Array.from(panel.querySelectorAll("[data-party-group]"), row => [
          row.dataset.partyGroup, row.querySelector("[data-party-label]").value.trim()
        ]));
        const assignments = Object.fromEntries(combat.combatants.map(member => [
          member.id, panel.querySelector(`[name="pte-party-member-${member.id}"]`)?.value
        ]));
        if (Object.values(assignments).some(id => !Object.hasOwn(groups, id))) {
          return ui.notifications.warn("Assign every combatant to a group.");
        }
        const occupied = readySides(combat, systemId, {groups, assignments});
        if (!occupied.size) return ui.notifications.warn("Add at least one undefeated combatant.");
        const scores = Object.fromEntries(Array.from(occupied, id => [
          id, panel.querySelector(`[name="pte-party-score-${id}"]`)?.valueAsNumber
        ]));
        if (Array.from(occupied).some(id => !groups[id] || !Number.isFinite(scores[id]))) {
          return ui.notifications.warn("Enter a name and initiative score for each group with an undefeated combatant.");
        }
        const order = Object.keys(groups).filter(id => occupied.has(id)).sort((a, b) => scores[b] - scores[a]);
        return combat.update({
          round: 1, turn: null,
          [statePath]: {groups, assignments, scores, order, activeSide: order[0], acted: []}
        });
      }

      if (action === "start" && !state && !combat.started) {
        if (readySides(combat, systemId).size !== 2) return;
        const players = panel.querySelector('[name="pte-player-score"]').valueAsNumber;
        const opponents = panel.querySelector('[name="pte-opponent-score"]').valueAsNumber;
        if (!Number.isFinite(players) || !Number.isFinite(opponents)) {
          return ui.notifications.warn("Enter one initiative score for each side.");
        }
        const tieWinner = panel.querySelector('[name="pte-tie-winner"]').value;
        const first = players === opponents ? tieWinner : players > opponents ? "players" : "opponents";
        const second = first === "players" ? "opponents" : "players";
        return combat.update({
          round: 1,
          turn: null,
          [statePath]: {scores: {players, opponents}, order: [first, second], activeSide: first, acted: []}
        });
      }

      if (!state) return;
      if (action === "end") return combat.endCombat();
      if (action === "advance") {
        const next = nextSideTurn(state, combat.round, readySides(combat, systemId, state));
        if (!next) return ui.notifications.warn("No undefeated combatants are left in the turn order.");
        return combat.update({round: next.round, turn: null, [statePath]: next.state});
      }

      if (action === "mark" && member && !member.isDefeated &&
          initiativeGroup(member, systemId, state) === state.activeSide) {
        const acted = state.acted.includes(member.id)
          ? state.acted.filter(id => id !== member.id) : [...state.acted, member.id];
        return combat.setFlag(systemId, FLAG, {...state, acted});
      }
    }
  }

  CONFIG.ui.combat = TwoSideCombatTracker;
}
