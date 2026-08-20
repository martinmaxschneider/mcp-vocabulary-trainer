import Combine
import Foundation

enum DownloadPhase: Equatable {
    case idle
    case saving(done: Int, total: Int)
    case done
}

@MainActor
final class AppModel: ObservableObject {
    let settings: AppSettingsStore
    let player = ListenPlayer()

    @Published var pack: StoredDailyPack?
    @Published var downloadPhase: DownloadPhase = .idle
    @Published var banner: String?
    @Published var serverReachable: Bool?

    private let store = PackStore()
    private var settingsBag = Set<AnyCancellable>()

    init() {
        settings = AppSettingsStore()
        settings.objectWillChange
            .sink { [weak self] _ in
                self?.objectWillChange.send()
            }
            .store(in: &settingsBag)
        pack = store.load()
        syncPlayer()
    }

    var currentLang: LanguageInfo {
        settings.targetLangs.first { $0.code == settings.targetLang }
            ?? settings.targetLangs.first
            ?? DefaultLanguages.fallback[0]
    }

    var statusLine: String {
        guard let pack else {
            return "Sprache wählen und aktuelles Paket laden – danach geht der Player ohne Mac."
        }
        return "Paket vom \(Self.formatDate(pack.date))"
    }

    func loadStoredPack() {
        pack = store.load()
        syncPlayer()
    }

    func probeServer() async {
        guard let url = settings.normalizedBaseURL else {
            serverReachable = false
            return
        }
        do {
            let health = try await MobileAPI(baseURL: url).health()
            if !health.targetLangs.isEmpty {
                settings.targetLangs = health.targetLangs
                if !health.targetLangs.contains(where: { $0.code == settings.targetLang }) {
                    settings.targetLang = health.targetLangs[0].code
                }
            }
            serverReachable = health.ok
        } catch {
            serverReachable = false
        }
    }

    func downloadCurrentPack() async {
        guard case .idle = downloadPhase else { return }
        guard let url = settings.normalizedBaseURL else {
            banner = MobileAPIError.missingServer.localizedDescription
            return
        }
        downloadPhase = .saving(done: 0, total: 0)
        do {
            let api = MobileAPI(baseURL: url)
            let response = try await api.daily(targetLang: settings.targetLang)
            guard let pkg = response.package, pkg.downloadable else {
                downloadPhase = .idle
                banner = "Kein gestartetes Paket für diese Sprache. Am Mac Daily starten, dann hier laden."
                return
            }
            player.tearDown()
            let saved = try await store.replace(package: pkg, download: { path in
                try await api.audioData(path: path)
            }, progress: { done, total in
                self.downloadPhase = .saving(done: done, total: total)
            })
            pack = saved
            syncPlayer()
            downloadPhase = .done
            banner = "Paket gespeichert."
            try? await Task.sleep(for: .seconds(2))
            if downloadPhase == .done {
                downloadPhase = .idle
            }
        } catch {
            downloadPhase = .idle
            banner = error.localizedDescription
        }
    }

    func applyListenSettings(_ next: ListenSettings) {
        settings.listenSettings = next
        player.applySettings(next)
    }

    func selectLanguage(_ code: String) {
        settings.targetLang = code
    }

    private func syncPlayer() {
        player.configure(
            items: pack?.items ?? [],
            settings: settings.listenSettings,
            fileURL: { [store] url in store.playableURL(for: url) }
        )
    }

    private static func formatDate(_ value: String) -> String {
        let parts = value.split(separator: "-")
        guard parts.count == 3 else { return value }
        return "\(parts[2]).\(parts[1]).\(parts[0])"
    }
}
