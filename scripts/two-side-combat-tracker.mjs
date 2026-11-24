const LABELS = {players: "Players", opponents: "Opponents"};
const FLAG = "sideInitiative";

function combatantSide(combatant, systemId) {
  const assignedSide = combatant.getFlag(systemId, "combatSide");
  if (Object.hasOwn(LABELS, assignedSide)) return assignedSide;
  return combatant.actor?.hasPlayerOwner ? "players" : "opponents";
}

function readySides(combat, systemId) {
  return new Set(combat.combatants.filter(member => !member.isDefeated)
    .map(member => combatantSide(member, systemId)));
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
    async _onRender(context, options) {
      await super._onRender(context, options);
      const root = this.element;
      if (!root) return;

      const container = root.querySelector(":scope > .window-content") ?? root;
      const combat = this.viewed;
      const state = combat?.getFlag(systemId, FLAG);
      const oldPanel = container.querySelector(":scope > .pte-side-initiative");
      const oldDetails = oldPanel?.dataset.encounterId === combat?.id ? oldPanel?.querySelector("details") : null;
      const isGM = game.user.isGM;
      const canManage = isGM && game.users.activeGM?.isSelf;
      const showSetup = canManage && combat && !combat.started && combat.combatants.size;
      const visibleMembers = combat?.combatants.filter(member => isGM || !member.hidden) ?? [];
      const sides = Object.entries(LABELS).map(([id, label]) => ({
        id, label,
        active: state?.activeSide === id,
        score: state?.scores[id],
        members: visibleMembers.filter(member => combatantSide(member, systemId) === id).map(member => ({
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
        sides, round: combat.round, running: Boolean(state), canManage,
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
      if (details && oldDetails) {
        details.open = oldDetails.open;
        for (const control of details.querySelectorAll("input, select")) {
          control.value = oldDetails.querySelector(`[name="${control.name}"]`).value;
        }
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
        const next = nextSideTurn(state, combat.round, readySides(combat, systemId));
        if (!next) return ui.notifications.warn("No undefeated combatants are left.");
        return combat.update({round: next.round, turn: null, [statePath]: next.state});
      }

      if (action === "mark" && member && !member.isDefeated &&
          combatantSide(member, systemId) === state.activeSide) {
        const acted = state.acted.includes(member.id)
          ? state.acted.filter(id => id !== member.id) : [...state.acted, member.id];
        return combat.setFlag(systemId, FLAG, {...state, acted});
      }
    }
  }

  CONFIG.ui.combat = TwoSideCombatTracker;
}
