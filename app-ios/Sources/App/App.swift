import RealityKit
import SwiftUI

@main
struct ApartmentARApp: App {
    var body: some SwiftUI.Scene {
        WindowGroup { ContentView() }
    }
}

struct ContentView: View {
    @State private var scene = ApartmentScene()
    @State private var screen = CGSize.zero
    @Environment(\.scenePhase) private var scenePhase

    // The camera view fills the screen, so the crosshair and the raycast share its full-screen coordinates.
    private var crosshair: CGPoint { CGPoint(x: screen.width / 2, y: screen.height * 0.28) }

    var body: some View {
        ZStack {
            ARContainer(view: scene.view)
                .ignoresSafeArea()
                .onGeometryChange(for: CGSize.self, of: \.size) { screen = $0 }
            if case .aligning(let draft) = scene.phase, draft.planPoint != nil {
                Image(systemName: "plus.viewfinder").font(.system(size: 44, weight: .thin)).foregroundStyle(.orange)
                    .position(crosshair)
                    .ignoresSafeArea()
            }
            VStack(spacing: 8) {
                if let note = scene.note { caption(note) }
                Spacer()
                panel
            }
            .padding(.horizontal)
        }
        .preferredColorScheme(.dark)
        .task { await scene.start() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background, scene.phase == .placed { Task { await scene.saveWorldMap(attempts: 1) } }
        }
    }

    private var panel: some View {
        Group {
            switch scene.phase {
            case .loading:
                ProgressView("Loading from \(API.baseURL.host() ?? "")")
            case .failed(let message):
                VStack(spacing: 12) {
                    Text(message).font(.callout)
                    Button("Retry") { Task { await scene.start() } }.buttonStyle(.borderedProminent)
                }
            case .relocalizing:
                VStack(spacing: 12) {
                    Text("Look around the room so it recognizes your saved alignment.").font(.callout)
                    Button("Realign", action: scene.realign).buttonStyle(.bordered)
                }
            case .aligning(let draft):
                VStack(spacing: 10) {
                    Text(draft.planPoint == nil
                        ? "Tap corner \(draft.first == nil ? 1 : 2) of 2 on the plan"
                        : "Aim the crosshair at that corner on the floor, then tap Set")
                        .font(.callout)
                    if let plan = scene.plan {
                        PlanMap(plan: plan, marks: draft.first.map { [$0.plan] } ?? [], selection: draft.planPoint, onPick: scene.pick)
                            .frame(height: min(300, screen.height * 0.4))
                    }
                    Button("Set point \(draft.first == nil ? 1 : 2)") { scene.markFloor(at: crosshair) }
                        .buttonStyle(.borderedProminent)
                        .disabled(draft.planPoint == nil)
                }
            case .placed:
                HStack {
                    VStack(alignment: .leading) {
                        Toggle("Outline", isOn: $scene.showsOutline)
                        Toggle("Textures", isOn: $scene.showsTextures)
                    }
                    .fixedSize()
                    Spacer()
                    Button("Realign", action: scene.realign).buttonStyle(.bordered)
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(.regularMaterial, in: .rect(cornerRadius: 20))
        .frame(maxWidth: 520)
    }

    private func caption(_ text: String) -> some View {
        Text(text)
            .font(.footnote)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(.regularMaterial, in: .capsule)
            .onTapGesture { scene.note = nil }
    }
}

struct ARContainer: UIViewRepresentable {
    let view: ARView
    func makeUIView(context: Context) -> ARView { view }
    func updateUIView(_ view: ARView, context: Context) {}
}
