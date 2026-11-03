import Foundation

// Mirrors packages/shared/src/items.ts. Plan coordinates are feet, +x east, +z south, y up from the floor.
struct CatalogItem: Decodable {
    struct Dimensions: Decodable { let width, height, depth: Float }

    let id: String
    let name: String
    let dimensions: Dimensions?
    let removeNodes: [String]
    let model: String?

    var signature: String { "\(id)|\(model ?? "")|\(removeNodes.joined(separator: ","))" }
}

struct Placement: Codable, Equatable {
    let key: String
    let itemId: String
    var position: [Double]
    var rotation: [Double]
}

// Mirrors packages/shared/src/plan.ts.
struct Plan: Decodable {
    struct Wall: Decodable { let rect: [Float]; let glass: Bool }
    struct Column: Decodable { let x, z, radius: Float }
    struct Room: Decodable { let name: String; let rect: [Float] }

    struct FinishSurfaces: Decodable {
        struct TVWall: Decodable { let x, z1, z2: Float }
        let tvWall: TVWall
        let column: Column
    }

    let walls: [Wall]
    let columns: [Column]
    let rooms: [Room]
    let ceiling: Float
    let finishSurfaces: FinishSurfaces
}

// Mirrors WallTexture and Finishes in packages/shared/src/items.ts.
struct WallTexture: Decodable {
    struct Tile: Decodable, Equatable {
        struct Size: Decodable, Equatable { let width, height: Float }
        let map: String
        let normalMap: String
        // Inches of wall one copy of the tile covers.
        let `repeat`: Size
        let depthIn: Float
    }

    let id: String
    let texture: Tile?
}

struct Finishes: Decodable, Equatable {
    let tvWall: String?
    let column: String?
}

enum API {
    // The laptop's server over the tailnet. Override with `defaults write com.stefan.apartment-ar serverURL <url>`.
    static let baseURL = URL(string: UserDefaults.standard.string(forKey: "serverURL") ?? "http://stefans-macbook-pro.tailff2195.ts.net:6161")!

    static func plan() async throws -> Plan { try await get("api/plan") }
    static func catalog() async throws -> [CatalogItem] { try await get("api/catalog") }
    static func placements() async throws -> [Placement] { try await get("api/placements") }
    static func finishes() async throws -> Finishes { try await get("api/finishes") }
    static func textures() async throws -> [WallTexture] { try await get("api/textures") }

    // Texture files come as server-absolute paths with a `?v=` cache buster, like `/api/assets/<id>/texture.png?v=1`.
    static func assetURL(_ path: String) -> URL { URL(string: path, relativeTo: baseURL)!.absoluteURL }

    static func save(_ placement: Placement) async throws {
        var request = URLRequest(url: baseURL.appending(path: "api/placements/\(placement.key)"), timeoutInterval: 5)
        request.httpMethod = "PUT"
        request.httpBody = try JSONEncoder().encode(placement)
        let _: Placement = try await send(request)
    }

    // The GLB's `?v=` cache buster carries over, so a regenerated model gets a fresh URL.
    static func modelURL(_ item: CatalogItem) -> URL {
        var url = baseURL.appending(path: "api/catalog/\(item.id)/model.usdz")
        if let query = item.model.flatMap({ URLComponents(string: $0)?.queryItems }) { url.append(queryItems: query) }
        return url
    }

    private static func get<T: Decodable>(_ path: String) async throws -> T {
        try await send(URLRequest(url: baseURL.appending(path: path), timeoutInterval: 5))
    }

    private static func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw URLError(.badServerResponse, userInfo: [NSLocalizedDescriptionKey: "\(request.url!.path) returned \(status)"]) }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
