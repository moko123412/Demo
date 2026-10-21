# Menagerie

A classic-style isometric zoo builder that runs in the browser, inspired by the 2001-era zoo tycoon games.

Open `index.html` in a browser. There's no build step and nothing to install.

## Scenarios

Pick **🎯 Scenarios** on the start screen for eight challenges in the spirit of the original, from *Small Zoo* to the
*Zoo Tycoon Challenge*. Each one has a briefing, a list of goals and usually a time limit. Some have special maps
(a run-down old zoo, an island) or limit which animals you can adopt. Finishing a scenario unlocks the next one.
Check your progress any time with the 🎯 button in the top bar. Scenarios are defined in `js/scenarios.js`.

## How to play

1. **Fences**: drag a rectangle next to the path. A fully closed fence with no path inside becomes an exhibit.
2. **Terrain, Plants and Exhibit items**: shape the habitat. Each species has favourite terrain, plants, rocks and shelters.
3. **Animals**: pick a species and click inside an exhibit to adopt it.
4. **Staff**: zookeepers feed animals, clean dung and treat sick animals. Maintenance workers sweep litter.
5. **Food, Rides and Decor**: food and drink stands, restrooms, picnic tables, gift shops, info kiosks,
   donation boxes, a playground, a carousel, a swing ride and a Ferris wheel all go next to paths.
   Click a building to set its price. Guests refuse anything they think is overpriced.

The zoo runs through day and night. Lamps and rides light up after dark, animals sleep, and fewer guests arrive.
Fences wear out over time, and unhappy strong animals bash them, so hire maintenance workers to repair them.
Zookeepers recapture escaped animals.

Click any animal, guest, staff member or exhibit to see what they're thinking. An exhibit's panel lists its
suitability score for each species and what the animals still want, for example
"Lions would like more Acacia Tree or Elephant Grass."

Sound is generated in the browser (no audio files). Use 🔊 to mute and 🎵 to toggle the music.

Controls: drag, WASD or mouse-at-edge to scroll; wheel, pinch or ＋/－ to zoom; minimap to jump; right-click or Esc to cancel a tool;
Ctrl+Z to undo a build. Tool keys: Q select, T terrain, P paths, F fences, N animals, L plants, E exhibit items, B food,
R rides, V decor, H staff, X bulldoze, M minimap, Home to return to the entrance. Space pauses, 1/2/3 set the speed, G shows the grid.
The game autosaves every three months, and the 💾/📂 buttons save and load by hand (saves live in the browser's localStorage).

## Code layout

| File | Contents |
| --- | --- |
| `js/data.js` | Terrain, objects, species and staff definitions. Tune the game here. |
| `js/world.js` | Map state, fences, exhibit detection, suitability scoring, pathfinding, building, saving and loading |
| `js/scenarios.js` | Scenario definitions, goal checks, unlocks and special starting maps |
| `js/sim.js` | Animal, guest and staff behaviour, breeding, rating and monthly finances |
| `js/draw.js` | Isometric camera, baked terrain layer and all procedurally drawn sprites |
| `js/ui.js` | Top bar, build palette, info panels and dialogs |
| `js/audio.js` | Synthesized sound: animal calls, building and UI sounds, ambience and music |
| `js/main.js` | Input handling and the main loop |
