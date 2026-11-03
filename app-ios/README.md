# Apartment AR

An iPhone and iPad app that shows the furniture from the 3D plan in the real apartment through the camera. It is a personal app: it installs straight onto Stefan's iPhone and iPad from Xcode, never through TestFlight, and reads everything from the laptop's server over the tailnet.

## Run it

1. On the laptop, start the server from the repo root: `bun run start`. It listens on every interface, port 6161.
2. Connect the iPhone or iPad by cable or Wi-Fi pairing, unlock it, and run `./scripts/run` from this folder (`-t "Stefan’s iPad"` picks the iPad when both are connected). The launcher prefers a connected device, builds with team `FNYFHG5SV7`, installs, and launches.
3. Keep Tailscale on, on both the device and the laptop, with **Use Tailscale DNS** enabled on the device. The app talks to `http://stefans-macbook-pro.tailff2195.ts.net:6161`. The tailnet access policy must let the device reach the laptop; a device it leaves out times out with no other sign.

To point the app at another server, set `serverURL` in its defaults, for example on a simulator: `xcrun simctl spawn <udid> defaults write com.stefan.apartment-ar serverURL http://127.0.0.1:16161`.

## Use it

- **Align.** The first launch asks for two corners. Tap a corner on the plan (taps snap to wall-face corners), aim the crosshair at that corner on the real floor, and tap **Set point**. Repeat for a second corner far from the first. The caption compares the plan distance with the distance you marked, which shows how well the two agree.
- **Relaunch.** The app saves ARKit's world map with the alignment anchor. On the next launch, look around the room and the furniture reappears without marking points again. **Realign** starts over.
- **Move furniture.** Drag an item to slide it across the floor and twist with two fingers to turn it. The move saves to `data/placements.json` through the server, so the web plan shows it too.
- **Live updates.** The app polls placements every second, and the catalog and wall textures every 5 seconds, so items you move or import and textures you pick on the laptop appear on the phone.
- **Outline.** The wall footprints are drawn on the floor (glass in cyan) so you can check the alignment against the real walls.
- **Textures.** The wall textures picked in the web plan (`data/finishes.json`) cover the TV wall and sleeve the column at real tile scale, floor to ceiling. They stand an inch proud of the panel depth so LiDAR occlusion of the real wall can't hide them. The switch is on by default and the app remembers it.

On a LiDAR iPhone or iPad, real walls, furniture, and people hide the virtual furniture behind them.

## How the models get here

RealityKit can't read glTF, so the server converts each item's GLB at `GET /api/catalog/:id/model.usdz` with the USD tools that ship with macOS (`usdextract`, then `usdzip --arkitAsset`). The result is cached next to the GLB as `model.usdz` (git-ignored) and is rebuilt whenever the GLB is newer. The app sizes and centers each model the way the web plan does (`apps/ui/src/lib/scene.ts`).

## Simulator

The simulator has no camera tracking, so it shows the plan from above the living room instead. Use it to check models, placement, and the alignment screen. Run `./scripts/run -t "$(agent-simulator udid)" --headless --no-watch`.
