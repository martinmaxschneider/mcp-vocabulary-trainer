import Foundation

enum CardLine: String, Equatable, Hashable {
    case nativeIntro
    case targetIntro
    case nativeCard
    case targetCard
}

struct ListenPlaylistItem: Equatable, Hashable {
    var itemId: String
    var sentenceKey: String
    var listRound: Int
    var url: String
    var durationMs: Int?
    var pauseBeforeMs: Int
    var kind: String
    var line: CardLine
}

struct SentenceBounds: Equatable {
    var start: Int
    var prevStart: Int?
    var nextStart: Int?
}

enum ListenPlaylist {
    static let fallbackClipMs = 2500

    static func line(
        for clip: MobileClip,
        item: MobileDailyItem,
        mainsSeen: inout Int,
        transSeen: inout Int
    ) -> CardLine {
        let hasIntro = item.nativeIntro != nil || item.targetIntro != nil
        if clip.kind == "main" {
            let index = mainsSeen
            mainsSeen += 1
            if hasIntro, index == 0 { return .nativeIntro }
            return .nativeCard
        }
        let index = transSeen
        transSeen += 1
        if hasIntro, index == 0 { return .targetIntro }
        return .targetCard
    }

    static func clipsForPass(_ clips: [MobileClip], playMain: Bool) -> [MobileClip] {
        if playMain { return clips }
        let withoutMain = clips.filter { $0.kind != "main" }
        return withoutMain.isEmpty ? clips : withoutMain
    }

    static func playMainOnPass(settings: ListenSettings, listRound: Int, repeatIndex: Int) -> Bool {
        !settings.mainLangOnce || (listRound == 0 && repeatIndex == 0)
    }

    static func build(items: [MobileDailyItem], settings: ListenSettings) -> [ListenPlaylistItem] {
        var playlist: [ListenPlaylistItem] = []
        for listRound in 0 ..< settings.listRepeats {
            for (jobIndex, item) in items.enumerated() where !item.clips.isEmpty {
                for repeatIndex in 0 ..< settings.repeatsPerSentence {
                    let clips = clipsForPass(
                        item.clips,
                        playMain: playMainOnPass(
                            settings: settings,
                            listRound: listRound,
                            repeatIndex: repeatIndex
                        )
                    )
                    var mainsSeen = 0
                    var transSeen = 0
                    for clip in clips {
                        playlist.append(
                            ListenPlaylistItem(
                                itemId: item.id,
                                sentenceKey: "\(listRound):\(jobIndex)",
                                listRound: listRound,
                                url: clip.url,
                                durationMs: clip.durationMs,
                                pauseBeforeMs: settings.pauseMs,
                                kind: clip.kind,
                                line: line(
                                    for: clip,
                                    item: item,
                                    mainsSeen: &mainsSeen,
                                    transSeen: &transSeen
                                )
                            )
                        )
                    }
                }
            }
        }
        return playlist
    }

    static func remainingMs(
        _ plan: [ListenPlaylistItem],
        done: Int,
        playbackRate: Double
    ) -> Int {
        let start = max(0, done - 1)
        guard start < plan.count else { return 0 }
        let rate = playbackRate > 0 ? playbackRate : 1
        return plan[start...].reduce(0) { sum, clip in
            let audioMs = Double(clip.durationMs ?? fallbackClipMs) / rate
            return sum + clip.pauseBeforeMs + Int(audioMs.rounded())
        }
    }

    static func sentenceBounds(_ playlist: [ListenPlaylistItem], index: Int) -> SentenceBounds {
        guard playlist.indices.contains(index) else {
            return SentenceBounds(start: 0, prevStart: nil, nextStart: nil)
        }
        let current = playlist[index]
        let start = playlist.firstIndex { $0.sentenceKey == current.sentenceKey } ?? index
        var prevStart: Int?
        if start > 0 {
            let prevKey = playlist[start - 1].sentenceKey
            prevStart = playlist.firstIndex { $0.sentenceKey == prevKey }
        }
        let nextStart = playlist.indices.dropFirst(index + 1).first {
            playlist[$0].sentenceKey != current.sentenceKey
        }
        return SentenceBounds(start: start, prevStart: prevStart, nextStart: nextStart)
    }
}
