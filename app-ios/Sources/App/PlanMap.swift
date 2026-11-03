import SwiftUI
import simd

// Top-down plan. It either offers the AR rooms to tap, or zooms to one room for picking alignment points, where taps
// snap to the nearest wall-face corner: the spots you can find exactly on the real floor.
struct PlanMap: View {
    enum Mode {
        case rooms(current: ARRoom?, onPick: (ARRoom) -> Void)
        case corners(in: ARRoom, marks: [SIMD2<Float>], selection: SIMD2<Float>?, onPick: (SIMD2<Float>) -> Void)
    }

    let plan: Plan
    let mode: Mode

    var body: some View {
        GeometryReader { geometry in
            let fit = Fit(bounds: focus, size: geometry.size)
            Canvas { context, _ in
                for room in plan.rooms {
                    let rect = fit.rect(room.rect)
                    let ar = ARRoom(rawValue: room.name)
                    let fill: Color = switch (mode, ar) {
                    case (.rooms(let current, _), .some(let ar)): .orange.opacity(ar == current ? 0.55 : 0.25)
                    default: .white.opacity(0.06)
                    }
                    context.fill(Path(rect), with: .color(fill))
                    let label = Text(room.name).font(.system(size: ar == nil ? 9 : 12, weight: ar == nil ? .regular : .semibold))
                    context.draw(label.foregroundStyle(ar == nil ? .secondary : .primary), at: CGPoint(x: rect.midX, y: rect.midY))
                }
                for wall in plan.walls {
                    context.fill(Path(fit.rect(wall.rect)), with: .color(wall.glass ? .cyan : .white))
                }
                for column in plan.columns {
                    let center = fit.point([column.x, column.z]), r = CGFloat(column.radius) * fit.scale
                    context.fill(Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r)), with: .color(.white))
                }
                if case .corners(_, let marks, let selection, _) = mode {
                    for (index, mark) in marks.enumerated() { dot(context, fit.point(mark), .green, "\(index + 1)") }
                    if let selection { dot(context, fit.point(selection), .orange, "\(marks.count + 1)") }
                }
            }
            .contentShape(Rectangle())
            .gesture(SpatialTapGesture().onEnded { tap(fit.plan($0.location)) })
        }
        .clipped()
        .accessibilityLabel("Floor plan")
    }

    // The room being aligned with a few feet of its walls around it, or the whole plan.
    private var focus: [Float] {
        if case .corners(let room, _, _, _) = mode, let r = plan.rect(of: room) { return [r[0] - 2, r[1] - 2, r[2] + 2, r[3] + 2] }
        let xs = plan.walls.flatMap { [$0.rect[0], $0.rect[2]] }, zs = plan.walls.flatMap { [$0.rect[1], $0.rect[3]] }
        return [xs.min() ?? 0, zs.min() ?? 0, xs.max() ?? 1, zs.max() ?? 1]
    }

    private func tap(_ point: SIMD2<Float>) {
        switch mode {
        case .rooms(_, let onPick):
            if let room = ARRoom.allCases.first(where: { plan.rect(of: $0).map { Plan.contains($0, point) } ?? false }) { onPick(room) }
        case .corners(_, _, _, let onPick):
            let nearest = plan.corners.min { simd_distance($0, point) < simd_distance($1, point) }
            onPick(nearest.flatMap { simd_distance($0, point) < 1.5 ? $0 : nil } ?? point)
        }
    }

    private func dot(_ context: GraphicsContext, _ point: CGPoint, _ color: Color, _ label: String) {
        context.fill(Path(ellipseIn: CGRect(x: point.x - 9, y: point.y - 9, width: 18, height: 18)), with: .color(color))
        context.draw(Text(label).font(.caption2.bold()).foregroundStyle(.black), at: point)
    }

    private struct Fit {
        let origin: SIMD2<Float>
        let scale: CGFloat
        let offset: CGPoint

        init(bounds: [Float], size full: CGSize) {
            let inset: CGFloat = 12
            let size = CGSize(width: full.width - 2 * inset, height: full.height - 2 * inset)
            origin = [bounds[0], bounds[1]]
            let width = CGFloat(bounds[2] - bounds[0]), height = CGFloat(bounds[3] - bounds[1])
            scale = min(size.width / width, size.height / height)
            offset = CGPoint(x: inset + (size.width - width * scale) / 2, y: inset + (size.height - height * scale) / 2)
        }

        func point(_ p: SIMD2<Float>) -> CGPoint {
            CGPoint(x: offset.x + CGFloat(p.x - origin.x) * scale, y: offset.y + CGFloat(p.y - origin.y) * scale)
        }

        func plan(_ p: CGPoint) -> SIMD2<Float> {
            [origin.x + Float((p.x - offset.x) / scale), origin.y + Float((p.y - offset.y) / scale)]
        }

        func rect(_ r: [Float]) -> CGRect {
            let a = point([r[0], r[1]]), b = point([r[2], r[3]])
            return CGRect(x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y)
        }
    }
}

extension Plan {
    func rect(of room: ARRoom) -> [Float]? { rooms.first { $0.name == room.rawValue }?.rect }

    static func contains(_ rect: [Float], _ point: SIMD2<Float>) -> Bool {
        point.x >= rect[0] && point.x <= rect[2] && point.y >= rect[1] && point.y <= rect[3]
    }

    // Corners of the walls' combined outline. Wall runs meet at their centerlines, so the inside corner of an L or T
    // junction is where one run's face crosses the other's, not a corner of either rectangle. Candidates are every
    // face crossing between two runs; those strictly inside a wall are dropped.
    var corners: [SIMD2<Float>] {
        let rects = walls.map(\.rect)
        let touches = { (p: SIMD2<Float>, r: [Float]) in p.x >= r[0] && p.x <= r[2] && p.y >= r[1] && p.y <= r[3] }
        let inside = { (p: SIMD2<Float>, r: [Float]) in p.x > r[0] && p.x < r[2] && p.y > r[1] && p.y < r[3] }
        var result: [SIMD2<Float>] = []
        for a in rects {
            for b in rects {
                for x in [a[0], a[2]] {
                    for z in [b[1], b[3]] {
                        let p = SIMD2(x, z)
                        if touches(p, a), touches(p, b), !rects.contains(where: { inside(p, $0) }) { result.append(p) }
                    }
                }
            }
        }
        return result
    }
}
