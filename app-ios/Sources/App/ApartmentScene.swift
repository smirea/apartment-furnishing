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
        // A saved world map is loaded and ARKit is still recognizing the room.
        case relocalizing
        case aligning(AlignmentDraft)
        case placed
    }

    private nonisolated static let anchorName = "plan"

    var phase = Phase.loading
    var plan: Plan?
    var note: String?
    var showsOutline = true { didSet { outline.isEnabled = showsOutline } }
    var showsTextures = UserDefaults.standard.object(forKey: "showsTextures") as? Bool ?? true {
        didSet {
            UserDefaults.standard.set(showsTextures, forKey: "showsTextures")
            wallFinishes.root.isEnabled = showsTextures
        }
    }

    @ObservationIgnored let view: ARView
    // Children of planRoot are in plan feet; its scale turns them into meters under the alignment anchor.
    @ObservationIgnored private let planRoot = Entity()
    @ObservationIgnored private let outline = Entity()
    @ObservationIgnored private let items = Entity()
    @ObservationIgnored private let wallFinishes = WallFinishes()
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
        wallFinishes.root.isEnabled = showsTextures
        view.session.delegate = self
    }

    func start() async {
        phase = .loading
        do {
            async let plan = API.plan()
            async let catalog = API.catalog()
            async let placements = API.placements()
            async let finishes = API.finishes()
            async let textures = API.textures()
            let loaded = try await plan
            self.plan = loaded
            buildOutline(loaded)
            self.catalog = Dictionary(try await catalog.map { ($0.id, $0) }) { a, _ in a }
            apply(try await placements)
            let (chosen, available) = (try await finishes, try await textures)
            Task { await applyFinishes(chosen, available) }
        } catch {
            phase = .failed("Can't reach \(API.baseURL.absoluteString): \(error.localizedDescription)")
            return
        }
        syncTask?.cancel()
        syncTask = Task { await sync() }
        #if targetEnvironment(simulator)
        showPreview()
        #else
        runSession()
        #endif
    }

    private func runSession(map: ARWorldMap? = WorldMapStore.load()) {
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
        let anchor = AnchorEntity(world: .zero)
        anchor.addChild(planRoot)
        let camera = PerspectiveCamera()
        camera.look(at: SIMD3(16, 0, 29) * metersPerFoot, from: SIMD3(16, 22, 45) * metersPerFoot, relativeTo: nil)
        anchor.addChild(camera)
        let light = DirectionalLight()
        light.light.intensity = 600
        light.look(at: .zero, from: [-2, 6, 4], relativeTo: nil)
        anchor.addChild(light)
        view.environment.background = .color(.darkGray)
        view.scene.addAnchor(anchor)
        phase = .placed
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
        guard tracking else { return }
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
                try WorldMapStore.write(data)
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
                    await applyFinishes(try await API.finishes(), try await API.textures())
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
        for placement in placements {
            guard let item = catalog[placement.itemId] else { continue }
            if let existing = placed[placement.key], existing.signature != item.signature { remove(placement.key, existing) }
            if placed[placement.key] == nil { add(placement, item) }
            if moving[placement.key] == nil { placed[placement.key]?.entity.transform = placement.transform }
        }
    }

    private func applyFinishes(_ finishes: Finishes, _ textures: [WallTexture]) async {
        guard let plan else { return }
        do {
            try await wallFinishes.apply(finishes, textures, plan: plan)
        } catch {
            note = "Wall texture: \(error.localizedDescription)"
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
