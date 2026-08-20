import Foundation

struct LanguageInfo: Codable, Equatable, Identifiable, Hashable {
    var code: String
    var name: String
    var flag: String

    var id: String { code }
}

struct MobileHealth: Codable, Equatable {
    var ok: Bool
    var name: String
    var nativeLang: LanguageInfo
    var targetLangs: [LanguageInfo]
}

struct MobileClip: Codable, Equatable, Hashable {
    var url: String
    var durationMs: Int?
    var kind: String
}

struct MobileDomain: Codable, Equatable, Hashable {
    var id: String
    var name: String
}

struct MobileDailyItem: Codable, Equatable, Identifiable, Hashable {
    var id: String
    var itemType: String
    var targetText: String
    var nativeText: String
    var tenseLabel: String?
    var domain: MobileDomain?
    var questionText: String?
    var questionTranslation: String?
    var audioStatus: String
    var clips: [MobileClip]

    var displayTitle: String {
        if itemType == "CONJUGATION", let tenseLabel, !tenseLabel.isEmpty {
            return "\(targetText) · \(tenseLabel)"
        }
        return targetText
    }

    var badges: [String] {
        [domain?.name, tenseLabel].compactMap { value in
            guard let value, !value.isEmpty else { return nil }
            return value
        }
    }

    var nativeIntro: String? {
        trimmed(questionTranslation)
    }

    var targetIntro: String? {
        let target = trimmed(questionText)
        guard let target, target != nativeIntro else { return nil }
        return target
    }

    private func trimmed(_ value: String?) -> String? {
        guard let value else { return nil }
        let next = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return next.isEmpty ? nil : next
    }
}

struct MobileDailyPackage: Codable, Equatable {
    var id: String
    var date: String
    var targetLang: String
    var status: String
    var audioReady: Bool
    var audioDone: Int
    var audioTotal: Int
    var downloadable: Bool
    var items: [MobileDailyItem]
}

struct MobileDailyResponse: Codable, Equatable {
    var date: String
    var package: MobileDailyPackage?
}

struct StoredDailyPack: Codable, Equatable {
    var id: String
    var date: String
    var targetLang: String
    var savedAt: String
    var items: [MobileDailyItem]
}

enum DefaultLanguages {
    static let fallback: [LanguageInfo] = [
        LanguageInfo(code: "en", name: "Englisch", flag: "🇬🇧"),
        LanguageInfo(code: "es", name: "Spanisch", flag: "🇪🇸"),
        LanguageInfo(code: "fr", name: "Französisch", flag: "🇫🇷"),
        LanguageInfo(code: "pt", name: "Portugiesisch", flag: "🇵🇹"),
        LanguageInfo(code: "gsw", name: "Schweizerdeutsch", flag: "🇨🇭"),
    ]
}
