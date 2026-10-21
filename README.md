# Menagerie

A classic-style isometric zoo builder that runs in the browser, inspired by the 2001-era zoo tycoon games.

Open `index.html` in a browser. There's no build step and nothing to install.

## How to play

1. **Fences**: drag a rectangle next to the path. A fully closed fence with no path inside becomes an exhibit.
2. **Terrain, Plants and Exhibit items**: shape the habitat. Each species has favourite terrain, plants, rocks and shelters.
3. **Animals**: pick a species and click inside an exhibit to adopt it.
4. **Staff**: zookeepers feed animals, clean dung and treat sick animals. Maintenance workers sweep litter.
5. **Guests**: food and drink stands, restrooms, benches, trash cans and decorations go next to paths.

Click any animal, guest, staff member or exhibit to see what they're thinking. An exhibit's panel lists its
suitability score for each species and what the animals still want, for example
"Lions would like more Acacia Tree or Elephant Grass."

Controls: drag or WASD to scroll, wheel or pinch to zoom, Space to pause, 1/2/3 to change speed, G for the grid, Esc to cancel.
The game autosaves every three months, and the 💾/📂 buttons save and load by hand (saves live in the browser's localStorage).

## Code layout

| File | Contents |
| --- | --- |
| `js/data.js` | Terrain, objects, species and staff definitions. Tune the game here. |
| `js/world.js` | Map state, fences, exhibit detection, suitability scoring, pathfinding, building, saving and loading |
| `js/sim.js` | Animal, guest and staff behaviour, breeding, rating and monthly finances |
| `js/draw.js` | Isometric camera, baked terrain layer and all procedurally drawn sprites |
| `js/ui.js` | Top bar, build palette, info panels and dialogs |
| `js/main.js` | Input handling and the main loop |
