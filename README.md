# Pokémon Tabletop Evolution for Foundry VTT

Unofficial Foundry VTT 13–14 adaptation of Pokémon Tabletop Evolution 1.07. Version 0.1.1, updated for Foundry VTT 14.370.

## Install from Foundry

Open **Game Systems → Install System** and paste this manifest URL.

`https://raw.githubusercontent.com/Nokami-0/Pokemon-Tabletop-evolution-/main/system.json`

## Manual installation

1. Close Foundry and open its User Data folder.
2. Extract the manual ZIP into `Data/systems`. The resulting path must end in `Data/systems/pokemon-tabletop-evolution/system.json`.
3. Restart Foundry. Create a world using **Pokémon Tabletop Evolution**.

## Play

- Create a **trainer** and one or more **pokemon** Actors. Assign each Pokémon's Trainer on its sheet to show it on their team and share the Pokémon action pool. Check off actions as you spend them and reset them each round.
- Use **Pokédex** on a Pokémon sheet to search 1,002 entries from PTE Pokédex 1.0. **Use Stats** overwrites the six base stats and types and fills HP for the current level. Apply it before allocating level-up points. The search results list species starting attack names where available. Enter the move mechanics separately using **Add Move**. GMs can also run `game.pte.openDex()` in a Script Macro to create a new Actor from an entry.
- Enter a move's type, category, AC and DB. Target tokens on the canvas and choose **Roll** next to the move. The chat message shows accuracy, each target's hit result, and calculated damage. Apply the final damage from the target's sheet. Temporary HP is used first.
- Click a skill name for a PTE dice pool, Boon or Bane, and optional Spirit Point spend. The result includes success count and CR outcome. Use party skill totals to determine initiative per the Rule Book.
- Use **Features** for class abilities, orders, roles, and optional techniques. Record the effect, source, action cost, and frequency. Manage gear with the Bag.

## Coverage

The system calculates HP, tiers, basic evasion, skill successes, STAB, critical damage dice, damage reduction, and type matchups from the supplied PTE rules. It supports manual party initiative, move frequency, range and keywords, combat stages, capture and evolution, and optional module effects. Class and technique compendiums, automatic status effects, species learnset automation, attack templates, and party turn sequencing are outside this build. Dex data covers species names, types, base stats, starting attack names when extractable, and source pages.

### Source books

- PTE Rule Book 1.07 · character creation pp. 9–26, skills pp. 29–36, combat values pp. 38–43, battle pp. 152–187, Pokémon management pp. 188–198.
- PTE Cheat Sheet · combat, skill checks, maneuvers, and conditions.
- PTE Pokédex 1.0 · source pages shown in the in-app browser.
- PTE GM Guide · encounter guidance and attack selection.
- The Path of Elementalism 0.1.08 and The Path of Occultism 0.1.01 draft · optional class and technique references.

## GitHub releases

Push the source to its own GitHub repository with Actions enabled. Tag the manifest version (for example, `v0.1.1`) and push the tag. The included workflow uploads a ZIP and a versioned Foundry manifest. For URL installs, the release assets must be accessible without GitHub login. Paste the release asset URL ending in `/releases/latest/download/system.json` into Foundry's Install System window.

## Credits

Tabletop design by **Azurespider** and the Pokémon Tabletop Evolution contributors, including Onarreshana, Thewonderwolf, and Starshine. Pokémon belongs to its respective rights holders. This fan project is unaffiliated with Nintendo, The Pokémon Company, or Foundry Gaming.
