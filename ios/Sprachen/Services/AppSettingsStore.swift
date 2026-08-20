import Foundation

@MainActor
final class AppSettingsStore: ObservableObject {
    @Published var serverURL: String {
        didSet { defaults.set(serverURL, forKey: Keys.serverURL) }
    }

    @Published var targetLang: String {
        didSet { defaults.set(targetLang, forKey: Keys.targetLang) }
    }

    @Published var listenSettings: ListenSettings {
        didSet { saveListenSettings() }
    }

    @Published var targetLangs: [LanguageInfo] {
        didSet { saveLanguages() }
    }

    @Published var appearance: AppearanceMode {
        didSet { defaults.set(appearance.rawValue, forKey: Keys.appearance) }
    }

    private let defaults = UserDefaults.standard

    private enum Keys {
        static let serverURL = "sprachen.serverURL"
        static let targetLang = "sprachen.targetLang"
        static let listenSettings = "sprachen.listenSettings"
        static let targetLangs = "sprachen.targetLangs"
        static let appearance = "sprachen.appearance"
    }

    init() {
        serverURL = defaults.string(forKey: Keys.serverURL) ?? ""
        targetLang = defaults.string(forKey: Keys.targetLang) ?? DefaultLanguages.fallback.first?.code ?? "en"
        if let data = defaults.data(forKey: Keys.listenSettings),
           let settings = try? JSONDecoder().decode(ListenSettings.self, from: data) {
            listenSettings = settings
        } else {
            listenSettings = .default
        }
        if let data = defaults.data(forKey: Keys.targetLangs),
           let langs = try? JSONDecoder().decode([LanguageInfo].self, from: data),
           !langs.isEmpty {
            targetLangs = langs
        } else {
            targetLangs = DefaultLanguages.fallback
        }
        if let raw = defaults.string(forKey: Keys.appearance),
           let mode = AppearanceMode(rawValue: raw) {
            appearance = mode
        } else {
            appearance = .system
        }
    }

    var normalizedBaseURL: URL? {
        let trimmed = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !trimmed.isEmpty else { return nil }
        if trimmed.contains("://") {
            return URL(string: trimmed)
        }
        return URL(string: "http://\(trimmed)")
    }

    private func saveListenSettings() {
        if let data = try? JSONEncoder().encode(listenSettings) {
            defaults.set(data, forKey: Keys.listenSettings)
        }
    }

    private func saveLanguages() {
        if let data = try? JSONEncoder().encode(targetLangs) {
            defaults.set(data, forKey: Keys.targetLangs)
        }
    }
}
