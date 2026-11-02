import SwiftUI
import simd

// Top-down plan for picking alignment points. Taps snap to the nearest wall-face corner, the spots you can find
// exactly on the real floor.
struct PlanMap: View {
    let plan: Plan
    let marks: [SIMD2<Float>]
    let selection: SIMD2<Float>?
    let onPick: (SIMD2<Float>) -> Void

    var body: some View {
        GeometryReader { geometry in
            let fit = Fit(plan: plan, size: geometry.size)
            Canvas { context, _ in
                for room in plan.rooms {
                    let rect = fit.rect(room.rect)
                    context.fill(Path(rect), with: .color(.white.opacity(0.06)))
                    context.draw(Text(room.name).font(.system(size: 9)).foregroundStyle(.secondary), at: CGPoint(x: rect.midX, y: rect.midY))
                }
                for wall in plan.walls {
                    context.fill(Path(fit.rect(wall.rect)), with: .color(wall.glass ? .cyan : .white))
                }
                for column in plan.columns {
                    let center = fit.point([column.x, column.z]), r = CGFloat(column.radius) * fit.scale
                    context.fill(Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r)), with: .color(.white))
                }
                for (index, mark) in marks.enumerated() { dot(context, fit.point(mark), .green, "\(index + 1)") }
                if let selection { dot(context, fit.point(selection), .orange, "\(marks.count + 1)") }
            }
            .contentShape(Rectangle())
            .gesture(SpatialTapGesture().onEnded { onPick(snap(fit.plan($0.location))) })
        }
        .accessibilityLabel("Floor plan")
    }

    private func dot(_ context: GraphicsContext, _ point: CGPoint, _ color: Color, _ label: String) {
        context.fill(Path(ellipseIn: CGRect(x: point.x - 9, y: point.y - 9, width: 18, height: 18)), with: .color(color))
        context.draw(Text(label).font(.caption2.bold()).foregroundStyle(.black), at: point)
    }

    private func snap(_ point: SIMD2<Float>) -> SIMD2<Float> {
        let corners = plan.walls.flatMap { w in [SIMD2(w.rect[0], w.rect[1]), SIMD2(w.rect[2], w.rect[1]), SIMD2(w.rect[0], w.rect[3]), SIMD2(w.rect[2], w.rect[3])] }
        let nearest = corners.min { simd_distance($0, point) < simd_distance($1, point) }
        return nearest.flatMap { simd_distance($0, point) < 1.5 ? $0 : nil } ?? point
    }

    private struct Fit {
        let origin: SIMD2<Float>
        let scale: CGFloat
        let offset: CGPoint

        init(plan: Plan, size full: CGSize) {
            let inset: CGFloat = 12
            let size = CGSize(width: full.width - 2 * inset, height: full.height - 2 * inset)
            let xs = plan.walls.flatMap { [$0.rect[0], $0.rect[2]] }, zs = plan.walls.flatMap { [$0.rect[1], $0.rect[3]] }
            origin = [xs.min() ?? 0, zs.min() ?? 0]
            let width = CGFloat((xs.max() ?? 1) - origin.x), height = CGFloat((zs.max() ?? 1) - origin.y)
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
