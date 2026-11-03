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
    @State private var picking: String?
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
        .sheet(isPresented: Binding(get: { picking != nil }, set: { if !$0 { picking = nil } })) {
            if let picking { FixturePicker(scene: scene, key: picking) }
        }
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
            case .choosingRoom:
                VStack(spacing: 10) {
                    Text("Tap the room you're in").font(.callout)
                    if let plan = scene.plan {
                        PlanMap(plan: plan, mode: .rooms(current: scene.room, onPick: scene.enter))
                            .frame(height: min(300, screen.height * 0.4))
                    }
                    if scene.canCancelRoomChoice { Button("Cancel", action: scene.cancelChoosingRoom).buttonStyle(.bordered) }
                }
            case .relocalizing:
                VStack(spacing: 12) {
                    Text("Look around the \(scene.room?.rawValue.lowercased() ?? "room") so it recognizes your saved alignment.").font(.callout)
                    HStack {
                        roomButton
                        Button("Realign", action: scene.realign).buttonStyle(.bordered)
                    }
                }
            case .aligning(let draft):
                VStack(spacing: 10) {
                    Text(draft.planPoint == nil
                        ? "Tap corner \(draft.first == nil ? 1 : 2) of 2 on the plan"
                        : "Aim the crosshair at that corner on the floor, then tap Set")
                        .font(.callout)
                    if let plan = scene.plan, let room = scene.room {
                        PlanMap(plan: plan, mode: .corners(in: room, marks: draft.first.map { [$0.plan] } ?? [], selection: draft.planPoint, onPick: scene.pick))
                            .frame(height: min(300, screen.height * 0.4))
                    }
                    HStack {
                        roomButton
                        Button("Set point \(draft.first == nil ? 1 : 2)") { scene.markFloor(at: crosshair) }
                            .buttonStyle(.borderedProminent)
                            .disabled(draft.planPoint == nil)
                    }
                }
            case .placed:
                VStack(spacing: 12) {
                    fixtureButtons
                    HStack {
                        VStack(alignment: .leading) {
                            Toggle("Outline", isOn: $scene.showsOutline)
                            Toggle("Textures", isOn: $scene.showsTextures)
                        }
                        .fixedSize()
                        Spacer()
                        VStack(alignment: .trailing) {
                            roomButton
                            Button("Realign", action: scene.realign).buttonStyle(.bordered)
                        }
                    }
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(.regularMaterial, in: .rect(cornerRadius: 20))
        .frame(maxWidth: 520)
    }

    // The room's fixtures (TV and wall texture, or the bed), each opening its picker with the current pick on it.
    @ViewBuilder private var fixtureButtons: some View {
        let here = scene.fixtures.filter { $0.room == scene.room?.rawValue }
        if !here.isEmpty {
            HStack {
                ForEach(here) { fixture in
                    Button { picking = fixture.key } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(fixture.title).font(.caption).foregroundStyle(.secondary)
                            Text(fixture.selectedOption?.name ?? "None").font(.subheadline).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    private var roomButton: some View {
        Button(action: scene.chooseRoom) {
            Label(scene.room?.rawValue ?? "Room", systemImage: "map")
        }
        .buttonStyle(.bordered)
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
