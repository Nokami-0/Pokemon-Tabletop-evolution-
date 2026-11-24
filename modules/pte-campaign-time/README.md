# PTE Campaign Clock, Calendar & Weather

## Manual installation

1. Extract the ZIP into your Foundry User Data folder under `Data/modules`. Confirm that `Data/modules/pte-campaign-time/module.json` exists.
2. Restart Foundry, enter your world, and enable **PTE Campaign Clock, Calendar & Weather** under **Manage Modules**.
3. Open **Token Controls** and click the clock icon. A Script Macro can also open it with `game.modules.get("pte-campaign-time").api.open()`.

The module uses the world's shared Foundry time. Players can view the current phase, browse the Gregorian calendar and see active weather. GMs can set or advance time and change field weather. At world time zero the clock displays January 1, 2000 at 08:00.

The five phases follow PTE Rule Book 1.07, p. 199. **+4 Hours** advances by one downtime action. **Next Phase** jumps to the next boundary. A scene can have two field weather conditions. Adding a third replaces the oldest. Remove weather when its source ends and resolve related attacks and abilities at the table.

The module has no system dependency. In Pokémon Tabletop Evolution worlds, it reads and writes the same scene weather as the system's built-in clock.
