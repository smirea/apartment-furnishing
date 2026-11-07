# Apartment AR

An iPhone and iPad app that shows the furniture from the 3D plan in the real apartment through the camera. It is a personal app: it installs straight onto Stefan's iPhone and iPad from Xcode, never through TestFlight, and reads everything from https://apartment.stf.lol.

## Run it

1. Connect the iPhone or iPad by cable or Wi-Fi pairing, unlock it, and run `./scripts/run` from this folder (`-t "Stefan’s iPad"` picks the iPad when both are connected). The launcher prefers a connected device, builds with team `FNYFHG5SV7`, installs, and launches.
2. The first run writes `Config/LocalSecrets.xcconfig` (git-ignored) with production's URL and `API_TOKEN` from env-manager, through `bun run env:ios` at the repo root. `Config/App.xcconfig` includes it, and the app sends the token as a bearer on every API call. Rerun `bun run env:ios` after rotating the token.

Pasting a link to import a TV, bed or wall texture needs the laptop's job runner (see the root README's **Where it runs**); everything else works with the laptop off.

To point the app at another server, set `serverURL` and that server's `apiToken` in its defaults, for example on a simulator against `bun run dev`: `xcrun simctl spawn <udid> defaults write com.stefan.apartment-ar serverURL http://127.0.0.1:6161` and `... apiToken <API_TOKEN from .env.local>`. `defaults delete` both to go back to production.

## Use it

- **Rooms.** The app works one room at a time: Bedroom, Living room, or Office / guest. The first launch asks you to tap the room you're in on the plan. Only that room's furniture and wall textures show. The room button (it shows the room's name) brings the plan back to switch rooms. Each room keeps its own alignment, and the app reopens in the last room.
- **Align.** A room without an alignment asks for two corners, with the plan zoomed to that room. Tap a corner on the plan (taps snap to wall-face corners), aim the crosshair at that corner on the real floor, and tap **Set point**. Repeat for a second corner far from the first. The caption compares the plan distance with the distance you marked, which shows how well the two agree.
- **Relaunch.** The app saves each room's ARKit world map with its alignment anchor. On the next launch or when you switch back to a room, look around and the furniture reappears without marking points again. **Realign** starts over.
- **Move furniture.** Drag an item to slide it across the floor and twist with two fingers to turn it. The move saves to the server's database, so the web plan shows it too.
- **Live updates.** The app polls placements every second, and the catalog and fixtures every 5 seconds, so items you move or import and fixtures you pick on the web plan appear on the phone.
- **Wi-Fi downloads.** On Wi-Fi (not a personal hotspot) the app downloads every model, wall texture, and picker thumbnail the server lists, with a caption counting down what's left, and keeps them on disk. Loading a room later, on cellular too, reads them from disk; only the plan, catalog, placements, and fixture lists still come from the server. A new or regenerated model or texture gets a new `?v=` URL, so it downloads again on the next Wi-Fi pass, and files the server no longer lists are deleted then.
- **Outline.** The wall footprints are drawn on the floor (glass in cyan) so you can check the alignment against the real walls.
- **Fixtures.** The TV, the bed and the wall texture show in their rooms the way the web plan builds them: the TV on its mount at its placement (back wall, pillar wall or corner) with its size on the screen, the bed with its headboard flush to the bedroom's north wall. The buttons above the toggles name each fixture of the room you're in and its pick. Tap one to switch between its options (or None) in a sheet that leaves the room visible, or paste a product link at the bottom to import a new one. The TV's sheet also has the web plan's Placement picker and its Height and Tilt sliders, which move the TV as you drag and save when you let go. Picks save on the server, so the web plan follows, and a pick made there shows here within 5 seconds.
- **Wall devices.** The TV wall's switch, outlet and data jack, and smoke alarm show where they really are. With a wall texture up they sit on the panel face, like in the web plan, so the panels never hide them.
- **Minimize.** Once placed, the chevron folds the controls into a glass button in the bottom corner, and tapping that button brings them back. The app remembers which way you left them. It runs on iOS 26 or later, for Liquid Glass.
- **Textures.** The picked wall texture covers the TV wall and sleeves the column at real tile scale, floor to ceiling. It stands an inch proud of the panel depth so LiDAR occlusion of the real wall can't hide it. The switch is on by default and the app remembers it.

On a LiDAR iPhone or iPad, real walls, furniture, and people hide the virtual furniture behind them.

## How the models get here

RealityKit can't read glTF, so the runner converts each GLB it saves with the USD tools that ship with macOS (`usdextract`, then `usdzip --arkitAsset`) and uploads `model.usdz` next to it before the item's model URL changes. The app fetches it at `GET /api/catalog/:id/model.usdz`. The app sizes and centers each model the way the web plan does (`apps/ui/src/lib/scene.ts`).

## Simulator

The simulator has no camera tracking, so it shows the plan from above the living room instead. Use it to check models, placement, and the alignment screen. Run `./scripts/run -t "$(agent-simulator udid)" --headless --no-watch`.
