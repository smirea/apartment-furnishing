import Metal
import RealityKit

// The wall textures chosen in the web plan, built like apps/ui/src/lib/scene.ts: panels on the TV wall's living-room
// face and a sleeve around the column, standing out by the panel depth, with the tile repeating at real scale.
@MainActor
final class WallFinishes {
    enum Surface: CaseIterable { case tvWall, column }

    // Past the panel face, so LiDAR occlusion of the real wall, a centimeter or two noisy, can't hide the panels.
    private static let standoffFeet: Float = 1 / 12

    let root = Entity()
    private var shown: [Surface: (tile: WallTexture.Tile, entity: Entity?)] = [:]
    private var textures: [String: Task<TextureResource, Error>] = [:]

    func apply(_ finishes: Finishes, _ catalog: [WallTexture], plan: Plan) async throws {
        let tiles = Dictionary(catalog.compactMap { texture in texture.texture.map { (texture.id, $0) } }) { a, _ in a }
        var failure: Error?
        for surface in Surface.allCases {
            let tile = (surface == .tvWall ? finishes.tvWall : finishes.column).flatMap { tiles[$0] }
            guard tile != shown[surface]?.tile else { continue }
            shown[surface]?.entity?.removeFromParent()
            shown[surface] = nil
            guard let tile else { continue }
            // Claimed before the downloads, so a poll arriving meanwhile doesn't build the same surface twice.
            shown[surface] = (tile, nil)
            do {
                let entity = try await build(surface, tile, plan)
                guard shown[surface]?.tile == tile else { continue }
                root.addChild(entity)
                shown[surface] = (tile, entity)
            } catch {
                if shown[surface]?.tile == tile { shown[surface] = nil }
                failure = error
            }
        }
        if let failure { throw failure }
    }

    private func build(_ surface: Surface, _ tile: WallTexture.Tile, _ plan: Plan) async throws -> Entity {
        async let map = texture(tile.map, .color)
        async let normal = texture(tile.normalMap, .normal)
        let offset = tile.depthIn / 12 + Self.standoffFeet
        let tileWidth = tile.repeat.width / 12, tileHeight = tile.repeat.height / 12
        let mesh: MeshResource, across: Float, transform: Transform
        switch surface {
        case .tvWall:
            let face = plan.finishSurfaces.tvWall
            let width = face.z2 - face.z1
            mesh = .generatePlane(width: width, height: plan.ceiling)
            across = width / tileWidth
            // The plane faces +z; a quarter turn faces it west into the living room with the tile's left edge north.
            transform = Transform(rotation: simd_quatf(angle: -.pi / 2, axis: [0, 1, 0]),
                                  translation: [face.x - offset, plan.ceiling / 2, (face.z1 + face.z2) / 2])
        case .column:
            let column = plan.finishSurfaces.column
            let radius = column.radius + offset
            mesh = try Self.sleeve(radius: radius, height: plan.ceiling)
            // Whole tiles around, so the seam where the sleeve closes matches.
            across = max(1, (2 * .pi * radius / tileWidth).rounded())
            transform = Transform(translation: [column.x, 0, column.z])
        }
        var material = PhysicallyBasedMaterial()
        let sampler = Self.repeating
        material.baseColor = .init(texture: .init(try await map, sampler: sampler))
        material.normal = .init(texture: .init(try await normal, sampler: sampler))
        material.roughness = 0.75
        material.faceCulling = .none
        material.textureCoordinateTransform = .init(scale: [across, plan.ceiling / tileHeight])
        let entity = ModelEntity(mesh: mesh, materials: [material])
        entity.transform = transform
        return entity
    }

    private func texture(_ path: String, _ semantic: TextureResource.Semantic) async throws -> TextureResource {
        if let task = textures[path] { return try await task.value }
        let task = Task {
            let (download, response) = try await URLSession.shared.download(from: API.assetURL(path))
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
            let file = FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).png")
            try FileManager.default.moveItem(at: download, to: file)
            defer { try? FileManager.default.removeItem(at: file) }
            return try await TextureResource(contentsOf: file, options: .init(semantic: semantic))
        }
        textures[path] = task
        do {
            return try await task.value
        } catch {
            textures[path] = nil
            throw error
        }
    }

    private static let repeating: MaterialParameters.Texture.Sampler = {
        let descriptor = MTLSamplerDescriptor()
        descriptor.sAddressMode = .repeat
        descriptor.tAddressMode = .repeat
        descriptor.minFilter = .linear
        descriptor.magFilter = .linear
        descriptor.mipFilter = .linear
        return .init(descriptor)
    }()

    // An open tube from the floor up, u running once around and v floor to top, normals outward.
    private static func sleeve(radius: Float, height: Float, segments: Int = 64) throws -> MeshResource {
        var positions: [SIMD3<Float>] = [], normals: [SIMD3<Float>] = [], uvs: [SIMD2<Float>] = [], indices: [UInt32] = []
        for i in 0...segments {
            let t = Float(i) / Float(segments)
            let out = SIMD3<Float>(sin(t * 2 * .pi), 0, cos(t * 2 * .pi))
            positions += [out * radius, out * radius + [0, height, 0]]
            normals += [out, out]
            uvs += [[t, 0], [t, 1]]
        }
        for i in 0..<UInt32(segments) {
            let base = i * 2
            indices += [base, base + 2, base + 1, base + 1, base + 2, base + 3]
        }
        var descriptor = MeshDescriptor(name: "sleeve")
        descriptor.positions = .init(positions)
        descriptor.normals = .init(normals)
        descriptor.textureCoordinates = .init(uvs)
        descriptor.primitives = .triangles(indices)
        return try .generate(from: [descriptor])
    }
}
