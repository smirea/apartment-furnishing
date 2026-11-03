import RealityKit
import UIKit

// The living-room TV, built like apps/ui/src/lib/scene.ts: a thin body on a tilting mount centered on the TV wall's
// measured span, out from any wall texture, with its size written on the screen. Plan feet, like the rest of planRoot.
enum TVEntity {
    private static let depth: Float = 1.2 / 12
    private static let mountDepth: Float = 2.5 / 12
    private static let bezel: Float = 0.3 / 12

    static func make(_ tv: TVSettings) -> Entity {
        let width = tv.widthIn / 12, height = tv.heightIn / 12
        let root = Entity()
        let body = ModelEntity(mesh: .generateBox(width: depth, height: height, depth: width),
                               materials: [SimpleMaterial(color: UIColor(white: 0.08, alpha: 1), roughness: 0.4, isMetallic: true)])
        root.addChild(body)
        let screen = ModelEntity(mesh: .generatePlane(width: width - 2 * bezel, height: height - 2 * bezel),
                                 materials: [SimpleMaterial(color: UIColor(red: 0.07, green: 0.09, blue: 0.13, alpha: 1), roughness: 0.25, isMetallic: false)])
        // A plane faces +z; a quarter turn faces it west into the living room.
        screen.orientation = simd_quatf(angle: -.pi / 2, axis: [0, 1, 0])
        screen.position.x = -depth / 2 - 0.002
        root.addChild(screen)
        let diagonal = (tv.widthIn * tv.widthIn + tv.heightIn * tv.heightIn).squareRoot()
        screen.addChild(text(String(format: "%.0f″", diagonal), size: height * 0.24, y: height * 0.08))
        screen.addChild(text(String(format: "%.1f″ × %.1f″", tv.widthIn, tv.heightIn), size: height * 0.08, y: -height * 0.16))
        return root
    }

    // `wallDepth` is how far a wall texture stands out from the wall, in feet.
    static func transform(_ tv: TVSettings, mount: Plan.Point, wallDepth: Float) -> Transform {
        let height = tv.heightIn / 12, tilt = tv.tiltDeg * .pi / 180
        // Tilting about the center swings the bottom edge toward the wall; the mount holds it out by that much.
        let x = mount.x - wallDepth - mountDepth - depth / 2 - height / 2 * sin(tilt)
        return Transform(rotation: simd_quatf(angle: tilt, axis: [0, 0, 1]), translation: [x, tv.centerIn / 12, mount.z])
    }

    private static func text(_ string: String, size: Float, y: Float) -> Entity {
        let mesh = MeshResource.generateText(string, extrusionDepth: 0.001, font: .systemFont(ofSize: CGFloat(size), weight: .semibold),
                                             containerFrame: .zero, alignment: .center, lineBreakMode: .byClipping)
        let entity = ModelEntity(mesh: mesh, materials: [UnlitMaterial(color: UIColor(white: 0.9, alpha: 1))])
        let bounds = entity.visualBounds(relativeTo: nil)
        entity.position = [-bounds.center.x, y - bounds.center.y, 0.002]
        return entity
    }
}
