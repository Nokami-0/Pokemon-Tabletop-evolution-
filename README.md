# Pokémon Tabletop Evolution for Foundry VTT

Unofficial Foundry VTT 13–14 adaptation of Pokémon Tabletop Evolution 1.07. Version 0.1.19 adds a dedicated Pokémon Roles section.

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
- Enter a move's type, category, AC and DB. Target tokens on the canvas and choose **Roll** next to the move. The chat message shows accuracy, each target's hit result, and calculated damage. Apply the final damage from the target's sheet. Temporary HP is used first.
- Click a skill name for a PTE dice pool, Boon or Bane, and optional Spirit Point spend. The result includes success count and CR outcome. Use party skill totals to determine initiative per the Rule Book.
- Use **Add Gear**, **Add Feature**, or **Add Class** under **Bag**, **Features**, or **Classes**. The dropdowns include core and optional source entries with page references, and a custom option for homebrew. You can add multiple classes to a trainer. Class prerequisites, feature effects, and gear rules are handled at the table.

Gear prices appear in the dropdown, Bag, and gear sheet. The editable unit price supports fixed prices, variable listings, and free items. Adding gear does not spend money.

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

**Basic Attack** is available from the Attack Tracking section without adding a learned move. Choose Physical or Special, Normal or a current Pokémon type, and the applicable weapon or Ranger profile. The attack supports tracking and treats Ghost immunity to Basic Attacks as resistance. Verify weapon or Ranger eligibility and map range at the table.

For a multi-actor skill check, target the other participants and choose **Opposed Check** or **Group Check**. The dialog supports separate skills and Boon/Bane settings. Opposed results break success ties by the sum of the dice. Group checks add the participant count to base CR.

**Pokémon Progression** uses the linked Trainer’s level cap and awards one unspent stat point per level gained. Apply up to five levels after a Trainer level-up or twenty from Downtime Training. The allocation tool enforces the Glass Cannon limit for tracked allocations and supports a GM exception. Existing stat edits and legacy XP do not count toward that tracker.

The Battle list defaults to six slots. Once full, newly added Pokémon moves go to Known. Move attacks between lists when the rules permit it. Use the granted attack checkbox for an attack that does not occupy a slot. Existing moves remain in Battle until you change their assignment.

Catalog acquisition checks supported level, skill rank, ownership, and class feature-count requirements. A linked Pokédex entry checks Pokémon starting and level-up moves and species abilities. Tutor selections, special grants, and ambiguous prerequisites require GM confirmation. These checks run through the sheet’s Add buttons. Existing items, edits, drag-and-drop, and imports are separate workflows.

Use **Pokémon Roles → Add Role** on the Pokémon sheet to assign a Rule Book role. The section shows starting stat options and the level 10 Rank 1 milestone. A second role requires level 30 and shares the progression choice with a second ability. Apply primary-role stats and effects at the table.

## Coverage

The system calculates HP, tiers, basic evasion, skill successes, STAB, critical damage dice, damage reduction, and type matchups from the supplied PTE rules. It supports manual party initiative, move frequency, range and keywords, combat stages, capture and evolution, and optional module effects. Class and technique compendiums, automatic status effects, species learnset automation, attack templates, and party turn sequencing are outside this build. Pokédex profiles include extracted reference data. Attack and ability effect text is available in the linked PTE Attacks & Ability Reference. Daily limits, ranges, and conditional effects are handled at the table.

### Source books

- PTE Rule Book 1.07 · character creation pp. 9–26, skills pp. 29–36, combat values pp. 38–43, battle pp. 152–187, Pokémon management pp. 188–198.
- PTE Cheat Sheet · combat, skill checks, maneuvers, and conditions.
- PTE Pokédex 1.0 · source pages shown in the in-app browser.
- PTE GM Guide · encounter guidance and attack selection.
- The Path of Elementalism 0.1.08 and The Path of Occultism 0.1.01 draft · optional class and technique references.

## GitHub releases

Push the source to its own GitHub repository with Actions enabled. Tag the manifest version (for example, `v0.1.19`) and push the tag. The included workflow uploads a ZIP and a versioned Foundry manifest. For URL installs, the release assets must be accessible without GitHub login. Paste the release asset URL ending in `/releases/latest/download/system.json` into Foundry's Install System window.

## Credits

Tabletop design by **Azurespider** and the Pokémon Tabletop Evolution contributors, including Onarreshana, Thewonderwolf, and Starshine. Pokémon belongs to its respective rights holders. This fan project is unaffiliated with Nintendo, The Pokémon Company, or Foundry Gaming.
