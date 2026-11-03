import ARKit
import RealityKit
import SwiftUI

struct AlignmentDraft: Equatable {
    var first: PointPair?
    // Picked on the plan, waiting for its spot on the real floor.
    var planPoint: SIMD2<Float>?
}

@MainActor @Observable
final class ApartmentScene: NSObject, ARSessionDelegate {
    enum Phase: Equatable {
        case loading
        case failed(String)
        case choosingRoom
        // A saved world map is loaded and ARKit is still recognizing the room.
        case relocalizing
        case aligning(AlignmentDraft)
        case placed
    }

    private nonisolated static let anchorName = "plan"

    var phase = Phase.loading
    var plan: Plan?
    // Only this room's furniture and wall textures show, aligned with this room's own world map.
    private(set) var room = UserDefaults.standard.string(forKey: "room").flatMap(ARRoom.init(rawValue:)) {
        didSet { UserDefaults.standard.set(room?.rawValue, forKey: "room") }
    }
    var note: String?
    var showsOutline = true { didSet { outline.isEnabled = showsOutline } }
    var showsTextures = UserDefaults.standard.object(forKey: "showsTextures") as? Bool ?? true {
        didSet {
            UserDefaults.standard.set(showsTextures, forKey: "showsTextures")
            wallFinishes.root.isEnabled = showsTextures
            applyFixtures()
        }
    }
    private(set) var fixtures: [Fixture] = []

    @ObservationIgnored let view: ARView
    // Children of planRoot are in plan feet; its scale turns them into meters under the alignment anchor.
    @ObservationIgnored private let planRoot = Entity()
    @ObservationIgnored private let outline = Entity()
    @ObservationIgnored private let items = Entity()
    @ObservationIgnored private let wallFinishes = WallFinishes()
    @ObservationIgnored private let fixtureRoot = Entity()
    // The TV wall's switch, outlets and smoke alarm, kept on whatever face the wall shows, like the web plan.
    @ObservationIgnored private let devices = Entity()
    // What each fixture currently draws, keyed by fixture; the signature changes when its pick or size does.
    @ObservationIgnored private var shownFixtures: [String: (signature: String, entity: Entity)] = [:]
    @ObservationIgnored private var textures: [WallTexture] = []
    // Bumped by every pick, so a fixtures poll that left before it can't put the old pick back, and polls answered
    // while picks are still saving are dropped.
    @ObservationIgnored private var fixtureEdits = 0
    @ObservationIgnored private var picksSaving = 0
    // The newest pick per fixture; replies to older picks that land after it are dropped.
    @ObservationIgnored private var latestPick: [String: UUID] = [:]
    @ObservationIgnored private var tvSave: Task<Void, Never>?
    @ObservationIgnored private var tvSaveID: UUID?
    @ObservationIgnored private var planAnchor: AnchorEntity?
    @ObservationIgnored private var marker: AnchorEntity?
    @ObservationIgnored private var catalog: [String: CatalogItem] = [:]
    @ObservationIgnored private var placements: [Placement] = []
    @ObservationIgnored private var placed: [String: PlacedItem] = [:]
    @ObservationIgnored private var templates: [String: Task<Entity, Never>] = [:]
    // Gestures and saves in flight per placement; polls leave those placements alone. A count, because a rotation can
    // outlive the translation that started with it, and a new drag can start before the last one saved.
    @ObservationIgnored private var moving: [String: Int] = [:]
    // Bumped when a save lands, so a poll that left before it can't put the old position back.
    @ObservationIgnored private var saves = 0
    @ObservationIgnored private var tracking = false
    @ObservationIgnored private var syncTask: Task<Void, Never>?
    @ObservationIgnored private var phaseBeforeChoosing: Phase?
    // The save of the room being left, which the next room's session reset would otherwise cut off.
    @ObservationIgnored private var leaving: Task<Void, Never>?
    // Bumped by every session reset, so a world map taken before a room change is never saved under the new room.
    @ObservationIgnored private var session = 0
    @ObservationIgnored private var previewCamera: PerspectiveCamera?

    private struct PlacedItem {
        let entity: ModelEntity
        let signature: String
        var gestures: [UIGestureRecognizer] = []
    }

    override init() {
        #if targetEnvironment(simulator)
        view = ARView(frame: .zero, cameraMode: .nonAR, automaticallyConfigureSession: false)
        #else
        view = ARView(frame: .zero, cameraMode: .ar, automaticallyConfigureSession: false)
        #endif
        super.init()
        planRoot.scale = SIMD3(repeating: metersPerFoot)
        planRoot.addChild(outline)
        planRoot.addChild(items)
        planRoot.addChild(wallFinishes.root)
        planRoot.addChild(fixtureRoot)
        planRoot.addChild(devices)
        wallFinishes.root.isEnabled = showsTextures
        view.session.delegate = self
    }

    func start() async {
        phase = .loading
        do {
            async let plan = API.plan()
            async let catalog = API.catalog()
            async let placements = API.placements()
            async let fixtures = API.fixtures()
            async let textures = API.textures()
            let loaded = try await plan
            let missing = ARRoom.allCases.filter { loaded.rect(of: $0) == nil }.map(\.rawValue)
            guard missing.isEmpty else { throw URLError(.cannotParseResponse, userInfo: [NSLocalizedDescriptionKey: "the plan has no \(missing.joined(separator: ", "))"]) }
            self.plan = loaded
            buildOutline(loaded)
            buildDevices(loaded)
            self.catalog = Dictionary(try await catalog.map { ($0.id, $0) }) { a, _ in a }
            apply(try await placements)
            (self.fixtures, self.textures) = (try await fixtures, try await textures)
            applyFixtures()
        } catch {
            phase = .failed("Can't reach \(API.baseURL.absoluteString): \(error.localizedDescription)")
            return
        }
        syncTask?.cancel()
        syncTask = Task { await sync() }
        WorldMapStore.removeLegacy()
        #if targetEnvironment(simulator)
        showPreview()
        #endif
        if let room { enter(room) } else { phase = .choosingRoom }
    }

    func chooseRoom() {
        if phase == .placed { leaving = Task { await saveWorldMap(attempts: 1) } }
        phaseBeforeChoosing = phase
        phase = .choosingRoom
    }

    var canCancelRoomChoice: Bool { phaseBeforeChoosing != nil }

    func cancelChoosingRoom() {
        guard let previous = phaseBeforeChoosing else { return }
        phaseBeforeChoosing = nil
        // Tracking and the anchor may have settled while the picker was up.
        phase = previous == .relocalizing && planAnchor != nil && tracking ? .placed : previous
    }

    // Shows the room's furniture and textures, then relocalizes with its saved map, or asks for two corners without one.
    func enter(_ room: ARRoom) {
        self.room = room
        phaseBeforeChoosing = nil
        for (key, item) in placed { remove(key, item) }
        apply(placements)
        applyFixtures()
        #if targetEnvironment(simulator)
        if let rect = plan?.rect(of: room) {
            let center = SIMD3((rect[0] + rect[2]) / 2, 0, (rect[1] + rect[3]) / 2)
            previewCamera?.look(at: center * metersPerFoot, from: (center + [0, 22, 16]) * metersPerFoot, relativeTo: nil)
        }
        phase = .placed
        #else
        let leaving = self.leaving
        self.leaving = nil
        Task {
            await leaving?.value
            guard self.room == room else { return }
            planAnchor?.removeFromParent()
            planAnchor = nil
            marker?.removeFromParent()
            runSession(map: WorldMapStore.load(room))
        }
        #endif
    }

    private func runSession(map: ARWorldMap?) {
        session += 1
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal]
        config.environmentTexturing = .automatic
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            config.sceneReconstruction = .mesh
            view.environment.sceneUnderstanding.options.insert(.occlusion)
        }
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.personSegmentationWithDepth) {
            config.frameSemantics.insert(.personSegmentationWithDepth)
        }
        config.initialWorldMap = map
        view.session.run(config, options: [.resetTracking, .removeExistingAnchors])
        phase = map == nil ? .aligning(AlignmentDraft()) : .relocalizing
    }

    // The simulator has no camera tracking, so it shows the plan from above the living room to check models and layout.
    private func showPreview() {
        guard previewCamera == nil else { return }
        let anchor = AnchorEntity(world: .zero)
        anchor.addChild(planRoot)
        let camera = PerspectiveCamera()
        anchor.addChild(camera)
        previewCamera = camera
        let light = DirectionalLight()
        light.light.intensity = 600
        light.look(at: .zero, from: [-2, 6, 4], relativeTo: nil)
        anchor.addChild(light)
        view.environment.background = .color(.darkGray)
        view.scene.addAnchor(anchor)
    }

    // MARK: Alignment

    // A fresh session, so a saved map that hasn't relocalized yet can't bring the old alignment back later.
    func realign() {
        #if targetEnvironment(simulator)
        phase = .aligning(AlignmentDraft())
        #else
        planAnchor?.removeFromParent()
        planAnchor = nil
        marker?.removeFromParent()
        runSession(map: nil)
        #endif
    }

    func pick(_ point: SIMD2<Float>) {
        guard case .aligning(var draft) = phase else { return }
        draft.planPoint = point
        phase = .aligning(draft)
    }

    func markFloor(at screenPoint: CGPoint) {
        guard case .aligning(var draft) = phase, let planPoint = draft.planPoint else { return }
        guard let hit = view.raycast(from: screenPoint, allowing: .estimatedPlane, alignment: .horizontal).first else {
            note = "No floor under the crosshair yet. Move the phone slowly so it can see the floor."
            return
        }
        let pair = PointPair(plan: planPoint, world: SIMD3(hit.worldTransform.columns.3.x, hit.worldTransform.columns.3.y, hit.worldTransform.columns.3.z))
        guard let first = draft.first else {
            draft.first = pair
            draft.planPoint = nil
            phase = .aligning(draft)
            showMarker(at: hit.worldTransform)
            note = nil
            return
        }
        let alignment = PlanAlignment(first, pair)
        guard alignment.planFeet >= 3 else {
            note = "Pick two points at least 3 ft apart."
            return
        }
        marker?.removeFromParent()
        view.session.add(anchor: ARAnchor(name: Self.anchorName, transform: alignment.transform))
        note = alignment.check
        phase = .placed
        Task { await saveWorldMap(attempts: 15) }
    }

    private func showMarker(at transform: simd_float4x4) {
        marker?.removeFromParent()
        let anchor = AnchorEntity(world: transform)
        anchor.addChild(ModelEntity(mesh: .generateSphere(radius: 0.03), materials: [UnlitMaterial(color: .systemOrange)]))
        view.scene.addAnchor(anchor)
        marker = anchor
    }

    // ARKit refuses to snapshot a map until it has seen enough of the room, so right after aligning this retries.
    func saveWorldMap(attempts: Int) async {
        #if !targetEnvironment(simulator)
        guard tracking, let room else { return }
        let generation = session
        for attempt in 1...attempts {
            do {
                let data: Data = try await withCheckedThrowingContinuation { continuation in
                    view.session.getCurrentWorldMap { map, error in
                        continuation.resume(with: Result {
                            guard let map else { throw error ?? CocoaError(.featureUnsupported) }
                            return try NSKeyedArchiver.archivedData(withRootObject: map, requiringSecureCoding: true)
                        })
                    }
                }
                guard generation == session else { return }
                try WorldMapStore.write(data, for: room)
                return
            } catch where attempt < attempts {
                try? await Task.sleep(for: .seconds(2))
            } catch {
                note = "Couldn't save the alignment: \(error.localizedDescription)"
            }
        }
        #endif
    }

    nonisolated func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
        let ids = anchors.filter { $0.name == Self.anchorName }.map(\.identifier)
        guard let id = ids.last else { return }
        MainActor.assumeIsolated { attach(to: id) }
    }

    // Placed means the anchor is in and tracking is normal: a restored map can hand back its anchors before ARKit has
    // relocalized, and after an interruption the world can be offset until it relocalizes again.
    nonisolated func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        let normal = camera.trackingState == .normal
        MainActor.assumeIsolated {
            tracking = normal
            if normal, phase == .relocalizing, planAnchor != nil { phase = .placed }
        }
    }

    nonisolated func sessionShouldAttemptRelocalization(_ session: ARSession) -> Bool { true }

    nonisolated func session(_ session: ARSession, didFailWithError error: Error) {
        let message = error.localizedDescription
        MainActor.assumeIsolated { note = "AR session failed: \(message)" }
    }

    private func attach(to id: UUID) {
        planAnchor?.removeFromParent()
        let anchor = AnchorEntity(.anchor(identifier: id))
        anchor.addChild(planRoot)
        view.scene.addAnchor(anchor)
        planAnchor = anchor
        if phase == .relocalizing, tracking { phase = .placed }
    }

    // MARK: Items

    private func sync() async {
        var tick = 0
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(1))
            tick += 1
            do {
                if tick.isMultiple(of: 5) {
                    catalog = Dictionary(try await API.catalog().map { ($0.id, $0) }) { a, _ in a }
                    let edits = fixtureEdits
                    let (incoming, available) = (try await API.fixtures(), try await API.textures())
                    textures = available
                    if edits == fixtureEdits, picksSaving == 0, incoming != fixtures { fixtures = incoming }
                    applyFixtures()
                }
                let generation = saves
                let incoming = try await API.placements()
                if generation == saves { apply(incoming) }
                if note?.hasPrefix("Server") == true { note = nil }
            } catch {
                note = "Server unreachable: \(error.localizedDescription)"
            }
        }
    }

    private func apply(_ incoming: [Placement]) {
        let local = Dictionary(placements.map { ($0.key, $0) }) { a, _ in a }
        placements = incoming.map { moving[$0.key] != nil ? local[$0.key] ?? $0 : $0 }
        let keys = Set(placements.map(\.key))
        for (key, item) in placed where !keys.contains(key) { remove(key, item) }
        let area = room.flatMap { plan?.rect(of: $0) }
        for placement in placements {
            // Room membership is decided when an item first shows, so dragging it through a doorway doesn't hide it.
            let inRoom = area.map { Plan.contains($0, [Float(placement.position[0]), Float(placement.position[2])]) } ?? false
            guard placed[placement.key] != nil || inRoom, let item = catalog[placement.itemId] else { continue }
            if let existing = placed[placement.key], existing.signature != item.signature { remove(placement.key, existing) }
            if placed[placement.key] == nil { add(placement, item) }
            if moving[placement.key] == nil { placed[placement.key]?.entity.transform = placement.transform }
        }
    }

    // MARK: Fixtures

    func select(_ fixture: Fixture, _ option: String?) {
        guard let index = fixtures.firstIndex(where: { $0.key == fixture.key }), fixtures[index].selected != option else { return }
        // A height drag still waiting to save carries the old TV's size and visibility, which would undo this pick.
        if fixture.kind == .tv, tvSave != nil {
            tvSave?.cancel()
            tvSave = nil
            tvSaveID = nil
            picksSaving -= 1
        }
        fixtureEdits += 1
        fixtures[index].selected = option
        applyFixtures()
        picksSaving += 1
        let pick = UUID()
        latestPick[fixture.key] = pick
        Task {
            defer { picksSaving -= 1 }
            do {
                let saved = try await API.select(fixture.key, option)
                fixtureEdits += 1
                if latestPick[fixture.key] == pick { store(saved) }
            } catch {
                note = "Couldn't switch the \(fixture.title.lowercased()): \(error.localizedDescription)"
                fixtureEdits += 1
                if let fresh = try? await API.fixtures() { fixtures = fresh; applyFixtures() }
            }
        }
    }

    // Slider drags move the TV at once and save once they pause, like the web plan's TV fields.
    func updateTV(_ tv: TVSettings) {
        guard let index = fixtures.firstIndex(where: { $0.kind == .tv }), fixtures[index].tv != tv else { return }
        fixtureEdits += 1
        fixtures[index].tv = tv
        applyFixtures()
        if tvSave == nil { picksSaving += 1 }
        tvSave?.cancel()
        let save = UUID()
        tvSaveID = save
        // Only the newest save touches the shared state; an older one cancelled mid-request leaves it alone.
        tvSave = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard tvSaveID == save else { return }
            let saved: Fixture?
            do { saved = try await API.save(tv) } catch {
                saved = nil
                if tvSaveID == save { note = "Couldn't save the TV: \(error.localizedDescription)" }
            }
            guard tvSaveID == save else { return }
            tvSave = nil
            picksSaving -= 1
            fixtureEdits += 1
            if let saved { store(saved) }
        }
    }

    func importOption(_ fixture: Fixture, url: String) async throws {
        let saved = try await API.importOption(fixture.key, url: url)
        fixtureEdits += 1
        // The new option's model or texture comes with the catalog or the texture list; if they don't load now, the
        // next poll brings them.
        if let items = try? await API.catalog() { catalog = Dictionary(items.map { ($0.id, $0) }) { a, _ in a } }
        if let available = try? await API.textures() { textures = available }
        store(saved)
    }

    func remove(_ fixture: Fixture, _ option: String) {
        Task {
            do {
                let saved = try await API.remove(fixture.key, option)
                fixtureEdits += 1
                store(saved)
            } catch {
                note = "Couldn't remove it: \(error.localizedDescription)"
            }
        }
    }

    private func store(_ fixture: Fixture) {
        guard let index = fixtures.firstIndex(where: { $0.key == fixture.key }) else { return }
        fixtures[index] = fixture
        applyFixtures()
    }

    // Only the fixtures of the room you're standing in show, like the furniture.
    private func applyFixtures() {
        guard let plan else { return }
        let tile = fixtures.first { $0.kind == .wallTexture }?.selected.flatMap { id in textures.first { $0.id == id }?.texture }
        // The TV and the wall's devices sit on the texture's face when one is up.
        let wallDepth = showsTextures ? tile.map { $0.depthIn / 12 + WallFinishes.standoffFeet } ?? 0 : 0
        for fixture in fixtures {
            let inRoom = fixture.room == room?.rawValue
            switch fixture.kind {
            case .item: showItem(fixture, inRoom: inRoom)
            case .tv:
                showTV(fixture, inRoom: inRoom, plan: plan, wallDepth: wallDepth)
            case .wallTexture, .other: break
            }
        }
        let area = room.flatMap { plan.rect(of: $0) }
        devices.isEnabled = area.map { Plan.contains($0, [plan.tvMount.x - 1, plan.tvMount.z]) } ?? false
        for (device, entity) in zip(plan.tvWallDevices, devices.children) {
            entity.position.x = (device.rect[0] + device.rect[2]) / 2 - wallDepth
        }
        Task {
            do {
                try await wallFinishes.apply(tile, plan: plan, room: room.flatMap(plan.rect(of:)))
            } catch {
                note = "Wall texture: \(error.localizedDescription)"
            }
        }
    }

    private func show(_ key: String, signature: String?, build: () -> Entity) {
        guard shownFixtures[key]?.signature != signature else { return }
        shownFixtures[key]?.entity.removeFromParent()
        shownFixtures[key] = nil
        guard let signature else { return }
        let entity = build()
        fixtureRoot.addChild(entity)
        shownFixtures[key] = (signature, entity)
    }

    // Rebuilt only when the size changes; height and tilt just move it, so a slider drag stays smooth.
    private func showTV(_ fixture: Fixture, inRoom: Bool, plan: Plan, wallDepth: Float) {
        let tv = fixture.tv.flatMap { inRoom && $0.visible && fixture.selected != nil ? $0 : nil }
        show(fixture.key, signature: tv.map { "\($0.widthIn)x\($0.heightIn)" }) { TVEntity.make(tv!) }
        if let tv { shownFixtures[fixture.key]?.entity.transform = TVEntity.transform(tv, mount: plan.tvMount, wallDepth: wallDepth) }
    }

    // Back flush to the fixture's wall face and centered on it, the way the web plan places it.
    private func showItem(_ fixture: Fixture, inRoom: Bool) {
        let item = inRoom ? fixture.selected.flatMap { catalog[$0] } : nil
        guard let spot = fixture.spot else { return }
        show(fixture.key, signature: item.map { "\($0.signature)|\(spot)" }) {
            let entity = Entity()
            let template = template(for: item!)
            Task {
                let model = await template.value.clone(recursive: true)
                guard shownFixtures[fixture.key]?.entity === entity else { return }
                entity.addChild(model)
                let halfDepth = model.visualBounds(relativeTo: entity).extents.z / 2
                let yaw = spot.yaw * .pi / 180
                entity.transform = Transform(rotation: simd_quatf(angle: yaw, axis: [0, 1, 0]),
                                             translation: [spot.x + sin(yaw) * halfDepth, 0, spot.z + cos(yaw) * halfDepth])
            }
            return entity
        }
    }

    private func remove(_ key: String, _ item: PlacedItem) {
        item.entity.removeFromParent()
        item.gestures.forEach(view.removeGestureRecognizer)
        placed[key] = nil
    }

    private func add(_ placement: Placement, _ item: CatalogItem) {
        let entity = ModelEntity()
        entity.name = placement.key
        items.addChild(entity)
        placed[placement.key] = PlacedItem(entity: entity, signature: item.signature)
        let template = template(for: item)
        Task {
            let model = await template.value.clone(recursive: true)
            guard placed[placement.key]?.entity === entity else { return }
            entity.addChild(model)
            let bounds = model.visualBounds(relativeTo: entity)
            entity.collision = CollisionComponent(shapes: [ShapeResource.generateBox(size: bounds.extents).offsetBy(translation: bounds.center)])
            let gestures = view.installGestures([.translation, .rotation], for: entity)
            gestures.forEach { $0.addTarget(self, action: #selector(gestureChanged)) }
            placed[placement.key]?.gestures = gestures
        }
    }

    private func template(for item: CatalogItem) -> Task<Entity, Never> {
        if let task = templates[item.signature] { return task }
        let task = Task {
            do {
                return try await Self.loadModel(item)
            } catch {
                note = "\(item.name): \(error.localizedDescription). Showing a box."
                return Self.box(item)
            }
        }
        templates[item.signature] = task
        return task
    }

    // Sized and centered like the web plan (apps/ui/src/lib/scene.ts): uniform scale to the listed width, origin at
    // the footprint center of the bottom face.
    private static func loadModel(_ item: CatalogItem) async throws -> Entity {
        guard item.model != nil else { return box(item) }
        let (download, response) = try await URLSession.shared.download(from: API.modelURL(item))
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        let file = FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).usdz")
        try FileManager.default.moveItem(at: download, to: file)
        let model = try await Entity(contentsOf: file)
        try? FileManager.default.removeItem(at: file)
        for name in item.removeNodes { (model.findEntity(named: name) ?? model.findEntity(named: usdName(name)))?.removeFromParent() }
        let size = model.visualBounds(relativeTo: model).extents
        let scale = item.dimensions.map { $0.width / 12 / size.x } ?? 1 / metersPerFoot
        model.scale = SIMD3(repeating: scale)
        let bounds = model.visualBounds(relativeTo: nil)
        model.position -= SIMD3(bounds.center.x, bounds.min.y, bounds.center.z)
        let root = Entity()
        root.addChild(model)
        castShadows(root)
        return root
    }

    private static func box(_ item: CatalogItem) -> Entity {
        let d = item.dimensions ?? .init(width: 24, height: 24, depth: 24)
        let box = ModelEntity(mesh: .generateBox(width: d.width / 12, height: d.height / 12, depth: d.depth / 12),
                              materials: [SimpleMaterial(color: .gray, isMetallic: false)])
        box.position.y = d.height / 24
        castShadows(box)
        return box
    }

    private static func castShadows(_ entity: Entity) {
        if entity.components.has(ModelComponent.self) { entity.components.set(GroundingShadowComponent(castsShadow: true)) }
        entity.children.forEach(castShadows)
    }

    @objc private func gestureChanged(_ recognizer: UIGestureRecognizer) {
        guard let entity = (recognizer as? any EntityGestureRecognizer)?.entity else { return }
        let key = entity.name
        guard let index = placements.firstIndex(where: { $0.key == key }) else { return }
        switch recognizer.state {
        case .began:
            moving[key, default: 0] += 1
        case .ended, .cancelled:
            var placement = placements[index]
            entity.position.y = Float(placement.position[1])
            let q = entity.orientation
            let round = { (v: Float) in (Double(v) * 100).rounded() / 100 }
            placement.position = [round(entity.position.x), placement.position[1], round(entity.position.z)]
            placement.rotation[1] = round(2 * atan2(q.imag.y, q.real) * 180 / .pi)
            placements[index] = placement
            Task {
                do {
                    try await API.save(placement)
                } catch {
                    note = "Couldn't save the move: \(error.localizedDescription)"
                }
                saves += 1
                moving[key] = moving[key].flatMap { $0 > 1 ? $0 - 1 : nil }
            }
        default:
            break
        }
    }

    // MARK: Outline

    private func buildDevices(_ plan: Plan) {
        devices.children.removeAll()
        for device in plan.tvWallDevices {
            let r = device.rect
            let color = UIColor(red: CGFloat(device.color >> 16 & 0xff) / 255, green: CGFloat(device.color >> 8 & 0xff) / 255,
                                blue: CGFloat(device.color & 0xff) / 255, alpha: 1)
            let entity = ModelEntity(mesh: .generateBox(width: r[2] - r[0], height: device.height, depth: r[3] - r[1]),
                                     materials: [SimpleMaterial(color: color, roughness: 0.5, isMetallic: false)])
            entity.position = [(r[0] + r[2]) / 2, device.y + device.height / 2, (r[1] + r[3]) / 2]
            devices.addChild(entity)
        }
    }

    // Wall footprints sit on the floor, so their edges trace the wall faces you aligned against.
    private func buildOutline(_ plan: Plan) {
        outline.children.removeAll()
        let height: Float = 0.08
        func material(_ color: UIColor) -> UnlitMaterial {
            var material = UnlitMaterial(color: color)
            material.blending = .transparent(opacity: 0.75)
            return material
        }
        let wall = material(.white), glass = material(.cyan)
        for w in plan.walls {
            let r = w.rect
            let entity = ModelEntity(mesh: .generateBox(width: r[2] - r[0], height: height, depth: r[3] - r[1]), materials: [w.glass ? glass : wall])
            entity.position = [(r[0] + r[2]) / 2, height / 2, (r[1] + r[3]) / 2]
            outline.addChild(entity)
        }
        for c in plan.columns {
            let entity = ModelEntity(mesh: .generateCylinder(height: height, radius: c.radius), materials: [wall])
            entity.position = [c.x, height / 2, c.z]
            outline.addChild(entity)
        }
    }
}

extension Placement {
    // Euler XYZ in degrees, as three.js applies them in the web plan.
    var transform: Transform {
        let r = rotation.map { Float($0) * .pi / 180 }
        let rotation = simd_quatf(angle: r[0], axis: [1, 0, 0]) * simd_quatf(angle: r[1], axis: [0, 1, 0]) * simd_quatf(angle: r[2], axis: [0, 0, 1])
        return Transform(scale: .one, rotation: rotation, translation: SIMD3(position.map { Float($0) }))
    }
}

// USD prim names can't start with a digit or hold punctuation, so the GLB-to-USDZ conversion renames such nodes:
// `18182363041_TV` becomes `_8182363041_TV`.
private func usdName(_ name: String) -> String {
    var characters = name.map { $0.isLetter || $0.isNumber || $0 == "_" ? $0 : "_" }
    if characters.first?.isNumber == true { characters[0] = "_" }
    return String(characters)
}
