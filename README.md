# Unofficial Pokémon Tabletop Evolution for Foundry VTT

Unofficial Foundry VTT 13–14 adaptation of Pokémon Tabletop Evolution 1.07. Version 0.1.25 adds order and capability references and shows Pokédex details on Pokémon sheets.

## Install from Foundry

Open **Game Systems → Install System** and paste this manifest URL.

`https://raw.githubusercontent.com/Nokami-0/Pokemon-Tabletop-evolution-/main/system.json`

## Manual installation

1. Close Foundry and open its User Data folder.
2. Extract the manual ZIP into `Data/systems`. The resulting path must end in `Data/systems/pokemon-tabletop-evolution/system.json`.
3. Restart Foundry. Create a world using **Pokémon Tabletop Evolution**.

## Play

- Create a **trainer** and one or more **pokemon** Actors. Assign each Pokémon's Trainer on its sheet to show it on their team and share the Pokémon action pool. Check off actions as you spend them and reset them each round.
- Use **Pokédex** on a Pokémon sheet to search 1,002 entries from PTE Pokédex 1.0. **Use Stats** overwrites the six base stats and types and fills HP for the current level. Apply it before allocating level-up points. The search results list species starting attack names where available. Choose the attack from **Add Move** to import its base mechanics. GMs can also run `game.pte.openDex()` in a Script Macro to create a new Actor from an entry.
- Catalog moves include their type. For a custom move, set its type on the item sheet. Target tokens and choose **Roll Only** to see each defender's typing, effectiveness and damage, or choose **Roll & Track** to also spend actions and apply damage to selected targets you can edit. Pokémon sheets show incoming matchups under **Battle Stats**. The PTE chart applies multipliers after defenses and combines both defender types. Fire is resisted by Water and Rock Pokémon individually (×0.5) and doubly resisted by Water/Rock Pokémon (×0.25).
- Click a skill name for a PTE dice pool, Boon or Bane, and optional Spirit Point spend. The result includes success count and CR outcome. Use **Roll Initiative** under **Profile → Battle Stats** for one actor or **Roll Party Initiative** to include targeted allies you own. Party rolls report the total and highest raw skill successes. The separate individual initiative option includes +1 per 5 effective Speed. Use these results to set party order at the table.
- Use **Add Gear**, **Add Feature**, or **Add Class** under **Bag**, **Features**, or **Classes**. The dropdowns include core and optional source entries with page references, and a custom option for homebrew. You can add multiple classes to a trainer. Class prerequisites, feature effects, and gear rules are handled at the table.

Open **Compendium Packs** to browse the PTE catalog in four Item packs. Drag gear, attacks, features, or classes onto an actor sheet. Existing eligibility checks apply to non-gear items, and adding gear does not spend money. To rebuild the packs, install the Foundry CLI and run `node tools/build-packs.mjs /absolute/path/to/@foundryvtt/foundryvtt-cli/index.mjs`.

Use recovery and boost gear from a Trainer or Pokémon Bag and choose a recipient. A Trainer, their linked Pokémon, and other editable targeted allies can receive an item. Malady Potions use a targeted Throw. To capture, target a wild Pokémon and use a regular Poké Ball after the scene. A confirmed capture spends one ball and adds the Pokémon to the Trainer's Team. Captures from unlinked tokens create a separate team actor.

Use **Bag → Create Weapon** to build equipment from the Rule Book’s weapon qualities, sizes, ranges, keywords, and attack allowances. Generated attacks require their weapon to be equipped. The builder lists a price and leaves payment, weapon acquisition, and situational effects to the table.

Gear prices appear in the dropdown, Bag, and gear sheet. The editable unit price supports fixed prices, variable listings, and free items. Adding gear does not spend money.

## Two-side initiative

Add combatants to an encounter and expand **Side Initiative** in the Combat Tracker before starting combat. Player-owned actors default to **Players**, and other actors default to **Opponents**. The active GM can move individual combatants between sides during setup. Enter one PTE initiative result per side and select which side wins a tie. Use **Start Side Initiative** to start this mode. The regular **Begin Combat** button uses individual initiative.

The higher-scoring side acts first. Its members can act in any order. The active GM can mark or unmark individual members as done, then click **End Side Turn**. Once both sides have had their turn, the tracker advances the round and clears the done marks. The score and side order carry forward, and the tracker skips sides with no undefeated combatants. **End Combat** opens Foundry's confirmation dialog.

Side initiative tracks side turns and member checkmarks. Resolve individual start- and end-of-turn effects at the table. Side initiative doesn't reset actor-sheet action pools.

To edit the feature in VS Code, open the system folder containing `system.json`. The registration is in `scripts/pte.mjs`. The combat rules and controls are in `scripts/two-side-combat-tracker.mjs`, and the layout is in `templates/combat/two-side-tracker.hbs`.

### Party / Group mode

Before starting combat, open **Group Initiative** and choose **Party / Group**. Name each group, enter one initiative score per group, and assign each combatant to a group. Use **Add Group** for additional teams. A trainer and their Pokémon can share a group, and rival trainers or wild Pokémon can have their own groups.

Following the PTE 1.07 Rule Book, p. 152, use either the sum of party skill successes or the highest individual success count for all parties. Choose up to two unacted combatants each time a party gains initiative. Their actions can interleave. Use **End Party Initiative** to mark them done for the round and pass initiative to the next party with eligible combatants. When only one party has eligible combatants left, it can act again. The next round refreshes tracked actions and starts with the highest-ranked eligible party other than the last to act, when possible. Use **Queue a new party for next round** for new arrivals. Ties use the group setup order.

## Campaign Clock & Calendar

Open **Clock & Calendar** from a Trainer or Pokémon sheet. The display follows Foundry's shared world time. GMs can advance time, jump to the next phase, or set a date and time. Players can view the clock and browse months.

The five phase boundaries follow PTE Rule Book 1.07, p. 199. **+4 Hours** is the rulebook cost of one downtime action. **Next Phase** moves to the next boundary, so Midnight can last up to eight hours. The calendar uses Gregorian months and starts at January 1, 2000, 08:00 when Foundry world time is zero.

### Field Weather

The clock shows the weather for the currently viewed scene. A GM can add or remove any of the eight PTE weather types. The field holds two active weather types, and adding a third replaces the oldest. Reapplying a type makes it the most recent. Remove a weather condition when the attack or field effect that created it ends. The tracker records conditions for the table to reference during play.

## Rule Library

Open **Rule Library** from a Trainer or Pokémon sheet. A GM can point each of the six entries at a PDF in Foundry Data or at an HTTPS address under **Configure Settings → Pokémon Tabletop Evolution**. The books themselves are supplied by the GM. Pokédex Details links straight to the species page once the Pokédex PDF is configured.

The Pokédex offers **Details** for evolution, abilities, capabilities, skill ranks, physical profile, and starting, level-up, and tutor attack lists where present. After species import the same profile is available from the Pokémon sheet.

Combat stages are editable per stat and feed effective movement, evasion, and attack damage. Reset stages to their defaults when a new scene starts.

Use the Afflictions section to track physical and mental afflictions. The sheet supports type immunities, end-turn poison/burn/wound damage, selected roll modifiers, and choosing a cure after a successful save. Trigger-specific effects and duration are resolved at the table.

Choose **Use** on a healing potion or poultice in the Bag. Confirm range and action costs at the table, then pick HP recovery, affliction removal, or potion revival. The system spends one item when it applies a valid effect. At scene end, use **Clear Scene Afflictions and Potions** to clear the once-per-scene potion restriction.

Choose a variant on a Strength or Vitality potion’s item sheet, then use it from the Bag. Combat-stage variants update the target’s current stages. Scene bonuses affect Accuracy, Critical Range, Evasion, or saves and clear with **Clear Scene Afflictions and Potions**. Use **Reset to Scene Defaults** separately for combat stages.

Choose a Malady Potion variant, target a token, and record the Throw result from the Bag. Both hits and misses spend the item. A hit applies the affliction unless the target is immune, fainted, or already affected. Choose the automatic Accuracy roll, adjacent Sureshot, or a manual hit or miss. Confirm range and adjacency at the table. The throw spends the actor’s Standard action or the linked Trainer’s shared Pokémon Standard action. Use **Action handled manually** for an action already accounted for at the table.

Use **Roll & Track** to spend the configured attack action and track At-Will, EOT, and Scene uses. Advance the actor’s attack turn at the start of its next turn and reset attack tracking when a new scene starts. After a tracked roll you can apply the calculated damage to selected targets you can edit. **Roll Only** supports manual adjudication.

**Rest & Recovery** handles half-HP recovery, full recovery, and GM-approved recovery from fainting to 1 HP. Applied damage uses temporary HP first. When a conscious actor reaches zero HP, tracked afflictions clear and stages return to their defaults.

Open **Combat Maneuvers** on either actor sheet to consult all 21 core maneuvers, including action costs, applicable accuracy checks, effects, and rulebook pages. Resolve their effects at the table.

Trainer sheets show Basic Orders with the Trainer’s current Tier bonuses and an Improvised Orders reference. Resolve order effects at the table. Both sheets show the capability reference and have a field for gained or modified capabilities. Pokémon linked to the Pokédex display their species traits, ability options, evolution and learnsets, plus species skill ranks under **Skills**. Editable skill dice pools continue to control rolls.

**Basic Attack** is available from the Attack Tracking section without adding a learned move. Choose Physical or Special, Normal or a current Pokémon type, and the applicable weapon or Ranger profile. The attack supports tracking and treats Ghost immunity to Basic Attacks as resistance. Verify weapon or Ranger eligibility and map range at the table.

For a multi-actor skill check, target the other participants and choose **Opposed Check** or **Group Check**. The dialog supports separate skills and Boon/Bane settings. Opposed results break success ties by the sum of the dice. Group checks add the participant count to base CR.

**Pokémon Progression** uses the linked Trainer’s level cap and awards one unspent stat point per level gained. Apply up to five levels after a Trainer level-up or twenty from Downtime Training. The allocation tool enforces the Glass Cannon limit for tracked allocations and supports a GM exception. Existing stat edits and legacy XP do not count toward that tracker.

The Battle list defaults to six slots. Once full, newly added Pokémon moves go to Known. Move attacks between lists when the rules permit it. Use the granted attack checkbox for an attack that does not occupy a slot. Existing moves remain in Battle until you change their assignment.

Catalog acquisition checks supported level, skill rank, ownership, and class feature-count requirements. A linked Pokédex entry checks Pokémon starting and level-up moves and species abilities. Tutor selections, special grants, and ambiguous prerequisites require GM confirmation. These checks run through the sheet’s Add buttons. Existing items, edits, drag-and-drop, and imports are separate workflows.

Use **Pokémon Roles → Add Role** on the Pokémon sheet to assign a Rule Book role. The section shows starting stat options and the level 10 Rank 1 milestone. A second role requires level 30 and shares the progression choice with a second ability. Apply primary-role stats and effects at the table.

Use the Trainer sheet’s **Wallet** to add or spend money. It keeps your existing balance, rejects overspending, and shows the most recent ten transactions. Adding items to the Bag does not automatically spend money.

Use **Pokémon Progression** on the Profile to apply level gains, allocate points, and claim trained skills, Role and milestone stat bonuses, and eligible Tutor Attacks. **Evolve Pokémon** handles named evolutions with a numeric level in the Pokédex and preserves stat investment. Review conditional evolutions, changes to skills and abilities, Evolution attacks, and optional custom upgrades with the GM. If you already applied an older reward manually, leave its claim unused to avoid doubling it.

The system package includes portraits and ringed map tokens for all 1,002 Pokédex entries. In Foundry’s Image Browser, choose **User Data → systems → pokemon-tabletop-evolution → assets → pte-tokens**. Pokémon imported through the Pokédex use both images automatically. Custom artwork installed in the configured artwork folder takes precedence. Use **Apply Species Artwork** on existing Pokémon to update their portrait, prototype token, and editable tokens in the current scene.

New Trainers start with a base HP stat of 10. Existing actors retain saved stats. Moves with a variable Damage Base show the workbook’s DB notation and prompt for the effect’s resolved value at roll time. Leave it empty for effects resolved manually.

The [PTE Character Sheet v2.1.7](https://docs.google.com/spreadsheets/d/1Sss1M3oeYxhsCDPecHq8bWY5LlgYsbqqbGu0-ZjYlGs/edit?gid=121154238) was used to cross-check attack base fields and the type chart. Species discrepancies retain the supplied Pokédex values.

## Coverage

The system calculates HP, tiers, basic evasion, skill successes, STAB, critical damage dice, damage reduction, and type matchups from the supplied PTE rules. It supports manual party initiative, move frequency, range and keywords, combat stages, capture and evolution, and optional module effects. Class and technique compendiums, automatic status effects, species learnset automation, attack templates, and party turn sequencing are outside this build. Pokédex profiles include extracted reference data. Attack and ability rules from the supplied character workbook appear in Effects and Rules. The linked reference remains available from the item sheet. Daily limits, ranges, and conditional effects are handled at the table.

### Source books

- PTE Rule Book 1.07 · character creation pp. 9–26, skills pp. 29–36, combat values pp. 38–43, battle pp. 152–187, Pokémon management pp. 188–198.
- PTE Cheat Sheet · combat, skill checks, maneuvers, and conditions.
- PTE Pokédex 1.0 · source pages shown in the in-app browser.
- PTE GM Guide · encounter guidance and attack selection.
- The Path of Elementalism 0.1.08 and The Path of Occultism 0.1.01 draft · optional class and technique references.

## GitHub releases

Push the source to its own GitHub repository with Actions enabled. Tag the manifest version (for example, `v0.1.25`) and push the tag. The included workflow uploads a ZIP and a versioned Foundry manifest. For URL installs, the release assets must be accessible without GitHub login. Paste the release asset URL ending in `/releases/latest/download/system.json` into Foundry's Install System window.

## Credits

Tabletop design by **Azurespider** and the Pokémon Tabletop Evolution contributors, including Onarreshana, Thewonderwolf, and Starshine. Pokémon belongs to its respective rights holders. This fan project is unaffiliated with Nintendo, The Pokémon Company, or Foundry Gaming.

### In-game Rule Library

With this manual system package installed, launch the world as GM to create the Pokémon Tabletop Evolution folder and its journals. Open **Rule Library** from a character sheet, or find it in the Journal sidebar. The six bundled books and the attack and ability indexes are available to all players by default, including the GM Guide.

If you previously enabled the separate PTE Journal Library module, disable it before relaunching. This system updates the old module's PDF links to point to the bundled books and preserves your existing journal permissions.
