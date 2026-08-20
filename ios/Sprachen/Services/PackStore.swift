import Foundation

enum PackStoreError: LocalizedError {
    case writeFailed(String)

    var errorDescription: String? {
        switch self {
        case .writeFailed(let message):
            return "Das Paket konnte nicht gespeichert werden. \(message)"
        }
    }
}

struct PackStore {
    private let fileManager = FileManager.default

    private var documentsURL: URL {
        fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    var rootURL: URL {
        documentsURL.appending(path: "daily", directoryHint: .isDirectory)
    }

    var packURL: URL {
        rootURL.appending(path: "pack.json")
    }

    var clipsURL: URL {
        rootURL.appending(path: "clips", directoryHint: .isDirectory)
    }

    func load() -> StoredDailyPack? {
        guard fileManager.fileExists(atPath: packURL.path) else { return nil }
        guard let data = try? Data(contentsOf: packURL) else { return nil }
        return try? JSONDecoder().decode(StoredDailyPack.self, from: data)
    }

    func fileURL(for clipURL: String) -> URL {
        clipsURL.appending(path: ClipPath.fileName(for: clipURL))
    }

    func playableURL(for clipURL: String) -> URL? {
        let stored = fileURL(for: clipURL)
        let candidates = [
            stored,
            stored.appendingPathExtension("mp3"),
            stored.appendingPathExtension("wav"),
        ]
        guard let existing = candidates.first(where: {
            fileManager.fileExists(atPath: $0.path)
        }) else {
            return nil
        }
        if !existing.pathExtension.isEmpty {
            return existing
        }
        return typedCopy(of: existing)
    }

    private func typedCopy(of url: URL) -> URL? {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
        let header = try? handle.read(upToCount: 12)
        try? handle.close()
        let ext = ClipPath.audioExtension(header ?? Data())
        let dest = fileManager.temporaryDirectory.appending(
            path: "\(url.lastPathComponent).\(ext)"
        )
        if !fileManager.fileExists(atPath: dest.path) {
            try? fileManager.copyItem(at: url, to: dest)
        }
        return fileManager.fileExists(atPath: dest.path) ? dest : nil
    }

    func replace(
        package: MobileDailyPackage,
        download: (String) async throws -> Data,
        progress: @MainActor (Int, Int) -> Void
    ) async throws -> StoredDailyPack {
        let token = UUID().uuidString
        let staging = documentsURL.appending(
            path: "daily-staging-\(token)",
            directoryHint: .isDirectory
        )
        let previous = documentsURL.appending(
            path: "daily-previous-\(token)",
            directoryHint: .isDirectory
        )
        let stagingClips = staging.appending(path: "clips", directoryHint: .isDirectory)

        do {
            try fileManager.createDirectory(at: stagingClips, withIntermediateDirectories: true)

            let urls = ClipPath.uniqueURLs(in: package.items)
            await progress(0, urls.count)
            for (index, url) in urls.enumerated() {
                let data = try await download(url)
                let name = ClipPath.fileName(for: url)
                let ext = ClipPath.audioExtension(data)
                let dest = stagingClips.appending(path: "\(name).\(ext)")
                try data.write(to: dest, options: .atomic)
                await progress(index + 1, urls.count)
            }

            let record = StoredDailyPack(
                id: package.id,
                date: package.date,
                targetLang: package.targetLang,
                savedAt: ISO8601DateFormatter().string(from: Date()),
                items: package.items.map { item in
                    var copy = item
                    copy.clips = item.clips.map { clip in
                        var next = clip
                        next.url = ClipPath.normalize(clip.url)
                        return next
                    }
                    return copy
                }
            )
            try JSONEncoder().encode(record).write(
                to: staging.appending(path: "pack.json"),
                options: .atomic
            )

            if fileManager.fileExists(atPath: rootURL.path) {
                try fileManager.moveItem(at: rootURL, to: previous)
            }
            try fileManager.moveItem(at: staging, to: rootURL)
            try? fileManager.removeItem(at: previous)
            return record
        } catch {
            if fileManager.fileExists(atPath: previous.path) {
                try? fileManager.removeItem(at: rootURL)
                try? fileManager.moveItem(at: previous, to: rootURL)
            }
            try? fileManager.removeItem(at: staging)
            throw PackStoreError.writeFailed(error.localizedDescription)
        }
    }
}
