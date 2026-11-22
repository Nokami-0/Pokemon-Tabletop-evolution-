# Editing Pokémon Tabletop Evolution

The files in `data/` hold the rules tables and compendium content. JavaScript modules load these files and implement game behavior. The system entry point, `scripts/pte.mjs`, connects Foundry sheets, dialogs, and hooks.

| What to change | File |
| --- | --- |
| Ready-to-use weapons, qualifying skills, keywords, and attacks | [data/weapon-builds.json](data/weapon-builds.json) |
| Training, Simple, Fine, and Legendary weapon limits and prices | [data/weapon-qualities.json](data/weapon-qualities.json) |
| Move and ability stats, weapon attack requirements | [data/attacks.json](data/attacks.json) |
| Reference text for moves and abilities, keyed by their source | [data/effects.json](data/effects.json) |
| Classes, talents, roles, features, gear listings, and prerequisites | [data/catalog.json](data/catalog.json) |
| Class and feature effects and rewards | [data/class-effects.json](data/class-effects.json), [data/class-grants.json](data/class-grants.json) |
| Item descriptions and equipped bonuses | [data/gear-rules.json](data/gear-rules.json), [data/equipment.json](data/equipment.json) |
| Type matchups, damage dice, potions, status lists, tutor tiers, and sizes | [data/rule-settings.json](data/rule-settings.json) |
| Maneuver actions and opposed skills | [data/maneuvers.json](data/maneuvers.json) |
| Capability descriptions and page references | [data/capabilities.json](data/capabilities.json) |
| Pokédex index and artwork paths | [data/dex.json](data/dex.json), [data/token-art.json](data/token-art.json) |
| Rules journal entries | [data/journal-reference.json](data/journal-reference.json) |

## Editing a rule or sheet

- **Calculations** live in [scripts/rules.mjs](scripts/rules.mjs).
- **Weapon keyword and attack eligibility** live in [scripts/weapons.mjs](scripts/weapons.mjs).
- **Item slots** and **capability costs** live in [data/item-slots.mjs](data/item-slots.mjs) and [data/capabilities.mjs](data/capabilities.mjs).
- **Class reward logic** and **prerequisite checks** live in [data/class-grants.mjs](data/class-grants.mjs) and [scripts/prerequisites.mjs](scripts/prerequisites.mjs).
- **Saved fields and defaults** live in [scripts/models.mjs](scripts/models.mjs).
- **The actor, item, and Pokédex sheets** use [templates/](templates/) and [styles/pte.css](styles/pte.css).
- **Map templates and journal installation** live in [scripts/range-templates.mjs](scripts/range-templates.mjs) and [scripts/journal-library.mjs](scripts/journal-library.mjs).

## Changing data in a local installation

1. Work in a copy of the system folder. Keep JSON keys and values in double quotes. Weapon IDs, source keys, and Pokédex page numbers are used to match records. Preserve them when changing descriptions or stats.
2. Use Node.js 22 or later. Run `node --input-type=module -e 'import "./data/weapon-presets.mjs"'` to validate weapon builds.
3. For the full species profiles, run `node tools/edit-dex-profiles.mjs unpack`, edit `dex-profiles.edit.json`, and run `node tools/edit-dex-profiles.mjs pack`.
4. Close Foundry before editing its compendium databases. Install `classic-level` with `npm install --no-save --no-package-lock classic-level@3.0.0`. Run `node tools/add-weapon-presets.mjs` to regenerate the preset weapons and `node tools/refresh-catalog-packs.mjs` to refresh data for matching existing catalog entries. A weapons rebuild adds new presets. The catalog refresh matches existing entries by type, name, and source, so adding or renaming a catalog entry requires a separate compendium edit.
5. Restart Foundry and reload open clients. World items copied from a compendium are independent documents. Edit existing world copies directly or import the updated compendium entry.
