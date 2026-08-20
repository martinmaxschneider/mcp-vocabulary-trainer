import Foundation

struct ListenSettings: Codable, Equatable {
    var pauseMs: Int
    var playbackRate: Double
    var repeatsPerSentence: Int
    var listRepeats: Int
    var autoAdvance: Bool
    var mainLangOnce: Bool

    static let `default` = ListenSettings(
        pauseMs: 1200,
        playbackRate: 1,
        repeatsPerSentence: 1,
        listRepeats: 1,
        autoAdvance: true,
        mainLangOnce: true
    )

    static let pauseRange = 0 ... 3000
    static let pauseStep = 100
    static let rateOptions: [Double] = [0.75, 1, 1.25]
    static let sentenceRepeatOptions = [1, 3, 5]
    static let listRepeatOptions = [1, 2, 3]

    var structureKey: String {
        "\(repeatsPerSentence):\(listRepeats):\(mainLangOnce ? 1 : 0):\(pauseMs)"
    }
}
