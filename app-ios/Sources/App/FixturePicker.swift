import SwiftUI

// Switches one fixture between its options, or imports a pasted product link as a new one. It reads the fixture from
// the scene, so polls and other clients' picks show while it's open.
struct FixturePicker: View {
    let scene: ApartmentScene
    let key: String

    @Environment(\.dismiss) private var dismiss
    @State private var link = ""
    @State private var importing = false
    @State private var error: String?

    private var fixture: Fixture? { scene.fixtures.first { $0.key == key } }
    private var canImport: Bool {
        !importing && URL(string: link.trimmingCharacters(in: .whitespaces))?.scheme?.hasPrefix("http") == true
    }

    var body: some View {
        NavigationStack {
            if let fixture {
                List {
                    Section {
                        row(fixture, name: "None", detail: nil, symbol: "circle.slash", selected: fixture.selected == nil) { scene.select(fixture, nil) }
                    }
                    ForEach(sections(fixture), id: \.name) { section in
                        Section(section.name ?? "") {
                            ForEach(section.options) { option in optionRow(fixture, option) }
                        }
                    }
                    Section("Add") {
                        HStack {
                            TextField(fixture.importLabel, text: $link)
                                .keyboardType(.URL)
                                .textContentType(.URL)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .submitLabel(.go)
                                .onSubmit { if canImport { submit(fixture) } }
                                .disabled(importing)
                            PasteButton(payloadType: String.self) { strings in link = strings.first ?? link }
                                .labelStyle(.iconOnly)
                                .disabled(importing)
                        }
                        Button(importing ? "Importing… about a minute" : "Import") { submit(fixture) }
                            .disabled(!canImport)
                        if let error { Text(error).font(.footnote).foregroundStyle(.red) }
                    }
                }
                .scrollDismissesKeyboard(.interactively)
                .navigationTitle(fixture.title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            }
        }
        .presentationDetents([.medium, .large])
        // The camera feed behind a glass sheet leaves its rows unreadable.
        .presentationBackground(.thickMaterial)
        .presentationBackgroundInteraction(.enabled(upThrough: .medium))
    }

    // Wall textures come in product lines, listed by name like the web plan's swatch rows.
    private func sections(_ fixture: Fixture) -> [(name: String?, options: [Fixture.Option])] {
        guard fixture.options.contains(where: { $0.group != nil }) else { return [(nil, fixture.options)] }
        return Dictionary(grouping: fixture.options) { $0.group ?? "Other" }
            .map { (name: Optional($0.key), options: $0.value.sorted { $0.name < $1.name }) }
            .sorted { $0.name! < $1.name! }
    }

    private func optionRow(_ fixture: Fixture, _ option: Fixture.Option) -> some View {
        let status: String? = switch option.job?.state {
        case "queued", "running": "Building, 2–5 min"
        case "failed": "Build failed"
        default: option.ready ? nil : "Not built yet"
        }
        return row(fixture, name: option.name, detail: option.detail, warning: option.warning, status: status, image: option.image,
                   selected: option.id == fixture.selected) { scene.select(fixture, option.id) }
            .disabled(!option.ready)
            .swipeActions {
                if fixture.removable, !option.url.isEmpty {
                    Button("Remove", role: .destructive) { scene.remove(fixture, option.id) }
                }
            }
    }

    private func row(_ fixture: Fixture, name: String, detail: String?, warning: String? = nil, status: String? = nil,
                     image: String? = nil, symbol: String? = nil, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                thumbnail(image, symbol: symbol ?? (fixture.kind == .tv ? "tv" : "photo"))
                VStack(alignment: .leading, spacing: 2) {
                    Text(name).foregroundStyle(.primary).lineLimit(2)
                    if let detail, !detail.isEmpty { Text(detail).font(.caption).foregroundStyle(.secondary) }
                    if let warning { Text(warning).font(.caption).foregroundStyle(.red) }
                    if let status { Text(status).font(.caption).foregroundStyle(.orange) }
                }
                Spacer(minLength: 0)
                if selected { Image(systemName: "checkmark").foregroundStyle(.tint).fontWeight(.semibold) }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func thumbnail(_ path: String?, symbol: String) -> some View {
        AsyncImage(url: path.map(API.assetURL)) { image in
            image.resizable().scaledToFill()
        } placeholder: {
            Image(systemName: symbol).foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.secondary.opacity(0.15))
        }
        .frame(width: 44, height: 44)
        .clipShape(.rect(cornerRadius: 6))
    }

    private func submit(_ fixture: Fixture) {
        let url = link.trimmingCharacters(in: .whitespaces)
        importing = true
        error = nil
        Task {
            do {
                try await scene.importOption(fixture, url: url)
                link = ""
            } catch {
                self.error = error.localizedDescription
            }
            importing = false
        }
    }
}
