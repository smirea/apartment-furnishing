import CryptoKit
import Foundation
import Network

// Models, textures and thumbnails on disk, one file per URL. The `?v=` cache busters make a URL's content fixed, so a
// file never goes stale. On Wi-Fi it downloads every asset the server lists, so in the apartment on cellular the room
// loads from disk.
@MainActor @Observable
final class AssetCache {
    static let shared = AssetCache()

    // Assets the running Wi-Fi download still has to fetch.
    private(set) var remaining = 0

    // Application Support rather than Caches: iOS empties Caches when storage runs low, which would throw away what
    // was fetched on Wi-Fi for later.
    @ObservationIgnored private let directory = URL.applicationSupportDirectory.appending(path: "assets", directoryHint: .isDirectory)
    @ObservationIgnored private var downloads: [URL: Task<URL, Error>] = [:]
    @ObservationIgnored private var wanted: Set<URL> = []
    @ObservationIgnored private var unmetered = false
    @ObservationIgnored private var prefetch: Task<Void, Never>?
    // A pass that ended with downloads failed, so the next poll tries them again.
    @ObservationIgnored private var retry = false
    @ObservationIgnored private let monitor = NWPathMonitor()

    private init() {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var excluded = URLResourceValues()
        excluded.isExcludedFromBackup = true
        var directory = directory
        try? directory.setResourceValues(excluded)
        // A personal hotspot is Wi-Fi too, but metered, so isExpensive leaves it out.
        monitor.pathUpdateHandler = { [weak self] path in
            let unmetered = path.status == .satisfied && !path.isExpensive
                && (path.usesInterfaceType(.wifi) || path.usesInterfaceType(.wiredEthernet))
            MainActor.assumeIsolated { self?.network(unmetered: unmetered) }
        }
        monitor.start(queue: .main)
    }

    // On any network: a file this URL already downloaded, or a fresh download of it.
    func file(for url: URL) async throws -> URL {
        let file = path(url)
        if FileManager.default.fileExists(atPath: file.path) { return file }
        if let download = downloads[url] { return try await download.value }
        let download = Task {
            defer { downloads[url] = nil }
            let (temporary, response) = try await URLSession.shared.download(for: API.authorized(URLRequest(url: url)))
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
            try? FileManager.default.removeItem(at: file)
            try FileManager.default.moveItem(at: temporary, to: file)
            return file
        }
        downloads[url] = download
        return try await download.value
    }

    // Every asset the server lists right now. On Wi-Fi the missing ones download one at a time and files nothing lists
    // anymore go; off Wi-Fi nothing is fetched or deleted until Wi-Fi comes back. Every URL must be versioned (`?v=`),
    // since a file on disk is never fetched again.
    func keep(_ urls: Set<URL>) {
        guard urls != wanted || retry else { return }
        wanted = urls
        restart()
    }

    private func network(unmetered: Bool) {
        guard unmetered != self.unmetered else { return }
        self.unmetered = unmetered
        restart()
    }

    // Leaving Wi-Fi stops it before the next file; the one in flight (a couple of MB at most) finishes.
    private func restart() {
        prefetch?.cancel()
        prefetch = nil
        retry = false
        remaining = 0
        guard unmetered, !wanted.isEmpty else { return }
        let urls = wanted
        prefetch = Task {
            let names = Set(urls.map { path($0).lastPathComponent })
            for file in (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
            where !names.contains(file.lastPathComponent) {
                try? FileManager.default.removeItem(at: file)
            }
            let missing = urls.filter { !FileManager.default.fileExists(atPath: path($0).path) }
            remaining = missing.count
            var failed = false
            for url in missing {
                guard !Task.isCancelled else { return }
                if (try? await file(for: url)) == nil { failed = true }
                guard !Task.isCancelled else { return }
                remaining -= 1
            }
            retry = failed
        }
    }

    // The extension stays, since RealityKit picks the loader by it.
    private func path(_ url: URL) -> URL {
        let hash = SHA256.hash(data: Data(url.absoluteString.utf8)).prefix(16).map { String(format: "%02x", $0) }.joined()
        return directory.appending(path: url.pathExtension.isEmpty ? hash : "\(hash).\(url.pathExtension)")
    }
}
