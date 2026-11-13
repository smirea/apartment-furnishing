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

    // Where the TV can hang; see TvSpot in packages/shared/src/plan.ts.
    struct TVSpot: Decodable { let x, z, yaw: Float; let onBackWall, corner: Bool }
    struct TVSpots: Decodable {
        let backWall, pillarWall, corner: TVSpot

        subscript(placement: TVSettings.Placement) -> TVSpot {
            switch placement {
            case .backWall: backWall
            case .pillarWall: pillarWall
            case .corner: corner
            }
        }
    }
    struct Device: Decodable { let rect: [Float]; let y, height: Float; let color: Int }

    let walls: [Wall]
    let columns: [Column]
    let rooms: [Room]
    let ceiling: Float
    let finishSurfaces: FinishSurfaces
    let tvSpots: TVSpots
    let tvWallDevices: [Device]
}

// Mirrors WallTexture in packages/shared/src/items.ts.
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

// Mirrors packages/shared/src/fixtures.ts: a built-in spot (the TV, the bed, the wall texture) holding one of several
// imported options. The picker treats every fixture alike; only drawing one depends on its kind.
struct Fixture: Decodable, Identifiable, Equatable {
    enum Kind: String, Decodable {
        case tv, wallTexture, item, other

        // A kind added on the server after this build still lists and switches, it just isn't drawn.
        init(from decoder: Decoder) throws {
            self = Kind(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .other
        }
    }

    struct Option: Decodable, Identifiable, Equatable {
        struct Job: Decodable, Equatable { let state: String; let error: String? }

        let id: String
        let name: String
        let url: String
        let image: String?
        let detail: String
        let warning: String?
        let group: String?
        let job: Job?
        let ready: Bool
    }

    // The middle of the wall face an item fixture's back sits flush against, in plan feet; yaw as Placement.rotation.
    struct Spot: Decodable, Equatable { let x, z, yaw, span: Float }

    let key: String
    let kind: Kind
    let title: String
    let room: String
    let importLabel: String
    let spot: Spot?
    var selected: String?
    let removable: Bool
    let options: [Option]
    var tv: TVSettings?

    var id: String { key }
    var selectedOption: Option? { options.first { $0.id == selected } }
}

// Doubles, so saving a new height writes the size back exactly as the web plan stored it.
struct TVSettings: Codable, Equatable {
    // TV_PLACEMENTS in packages/shared/src/items.ts.
    enum Placement: String, Codable, CaseIterable {
        case backWall, pillarWall, corner

        var label: String {
            switch self {
            case .backWall: "Back wall"
            case .pillarWall: "Pillar wall"
            case .corner: "Corner"
            }
        }
    }

    var visible: Bool
    var placement: Placement
    var widthIn, heightIn, centerIn, tiltDeg: Double
}

private struct ServerError: Decodable { let error: String }

enum API {
    // apartment.stf.lol and its token, built in from Config/App.xcconfig. A simulator on a local `bun run dev` overrides
    // both: `defaults write com.stefan.apartment-ar serverURL <url>` and `defaults write com.stefan.apartment-ar apiToken <token>`.
    static let baseURL = URL(string: UserDefaults.standard.string(forKey: "serverURL") ?? setting("APIURL"))!
    private static let token = UserDefaults.standard.string(forKey: "apiToken") ?? setting("APIToken")

    private static func setting(_ key: String) -> String {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String, !value.isEmpty else {
            preconditionFailure("\(key) is missing from the build. Run `bun run env:ios` at the repo root, then rebuild.")
        }
        return value
    }

    static func plan() async throws -> Plan { try await get("api/plan") }
    static func catalog() async throws -> [CatalogItem] { try await get("api/catalog") }
    static func placements() async throws -> [Placement] { try await get("api/placements") }
    static func textures() async throws -> [WallTexture] { try await get("api/textures") }
    static func fixtures() async throws -> [Fixture] { try await get("api/fixtures") }

    static func select(_ fixture: String, _ option: String?) async throws -> Fixture {
        try await send(json(["selected": option ?? NSNull()], "PUT", "api/fixtures/\(fixture)", timeout: 10))
    }

    // The job runner reads the page and has Codex parse it, which takes about a minute.
    static func importOption(_ fixture: String, url: String) async throws -> Fixture {
        try await send(json(["url": url], "POST", "api/fixtures/\(fixture)/import", timeout: 240))
    }

    // The TV's size and mount; picking an imported TV goes through select.
    static func save(_ tv: TVSettings) async throws -> Fixture {
        var request = URLRequest(url: baseURL.appending(path: "api/tv"), timeoutInterval: 10)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(tv)
        return try await send(request)
    }

    static func remove(_ fixture: String, _ option: String) async throws -> Fixture {
        var request = URLRequest(url: baseURL.appending(path: "api/fixtures/\(fixture)/options/\(option)"), timeoutInterval: 10)
        request.httpMethod = "DELETE"
        return try await send(request)
    }

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

    private static func json(_ body: [String: Any], _ method: String, _ path: String, timeout: TimeInterval) throws -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: path), timeoutInterval: timeout)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return request
    }

    private static func get<T: Decodable>(_ path: String) async throws -> T {
        try await send(URLRequest(url: baseURL.appending(path: path), timeoutInterval: 5))
    }

    // Every request needs the token, the photos, models and textures included.
    static func authorized(_ request: URLRequest) -> URLRequest {
        var request = request
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private static func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: authorized(request))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else {
            let message = (try? JSONDecoder().decode(ServerError.self, from: data))?.error ?? "\(request.url!.path) returned \(status)"
            throw URLError(.badServerResponse, userInfo: [NSLocalizedDescriptionKey: message])
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
