import ARKit
import simd

let metersPerFoot: Float = 0.3048

// A spot on the floor plan (feet, x and z) matched to where the user marked it on the real floor (ARKit meters).
struct PointPair: Equatable {
    var plan: SIMD2<Float>
    var world: SIMD3<Float>
}

// The rigid transform that lays the plan onto the room: a turn about gravity plus a shift, fitted to two point pairs.
// The scale is known (feet to meters), so the gap between the two plan distances is the user's marking error.
struct PlanAlignment {
    let transform: simd_float4x4
    let planFeet: Float
    let measuredFeet: Float

    init(_ a: PointPair, _ b: PointPair) {
        let pa = a.plan * metersPerFoot, pb = b.plan * metersPerFoot
        let wa = SIMD2(a.world.x, a.world.z), wb = SIMD2(b.world.x, b.world.z)
        // A turn of θ about +y carries the (x, z) heading atan2(-z, x) forward by θ.
        let heading = { (v: SIMD2<Float>) in atan2(-v.y, v.x) }
        let yaw = heading(wb - wa) - heading(pb - pa)
        let (c, s) = (cos(yaw), sin(yaw))
        let center = (pa + pb) / 2
        let shift = (wa + wb) / 2 - SIMD2(center.x * c + center.y * s, -center.x * s + center.y * c)
        var transform = simd_float4x4(simd_quatf(angle: yaw, axis: [0, 1, 0]))
        transform.columns.3 = [shift.x, (a.world.y + b.world.y) / 2, shift.y, 1]
        self.transform = transform
        planFeet = simd_distance(a.plan, b.plan)
        measuredFeet = simd_distance(wa, wb) / metersPerFoot
    }

    var check: String {
        String(format: "Plan says %.1f ft between the points, you marked %.1f ft", planFeet, measuredFeet)
    }
}

// The rooms you can stand in and align. Each keeps its own ARKit world map, because a map only relocalizes where its
// camera has been. Names match the plan's rooms (packages/shared/src/floorplan.ts).
enum ARRoom: String, CaseIterable {
    case bedroom = "Bedroom"
    case livingRoom = "Living room"
    case office = "Office / guest"
}

// Each room's world map carries its alignment anchor, so a relaunch relocalizes without marking points again.
enum WorldMapStore {
    // Before rooms there was one map for whichever room was aligned; it can't be assigned to a room, so it goes.
    static func removeLegacy() {
        try? FileManager.default.removeItem(at: URL.applicationSupportDirectory.appending(path: "world.arworldmap"))
    }

    static func url(_ room: ARRoom) -> URL { URL.applicationSupportDirectory.appending(path: "world-\(room).arworldmap") }

    static func load(_ room: ARRoom) -> ARWorldMap? {
        guard let data = try? Data(contentsOf: url(room)) else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: ARWorldMap.self, from: data)
    }

    static func write(_ data: Data, for room: ARRoom) throws {
        try FileManager.default.createDirectory(at: url(room).deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url(room), options: .atomic)
    }
}
