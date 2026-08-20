import AVFoundation
import Foundation
import MediaPlayer

private final class AudioPlayerBox: NSObject, AVAudioPlayerDelegate {
    var onFinish: ((Bool) -> Void)?

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        onFinish?(flag)
    }
}

@MainActor
final class ListenPlayer: ObservableObject {
    @Published private(set) var playlist: [ListenPlaylistItem] = []
    @Published private(set) var clipIndex = 0
    @Published private(set) var paused = true
    @Published private(set) var awaitingNext = false
    @Published private(set) var buffering = false
    @Published private(set) var remainingMs = 0
    @Published private(set) var loopCurrent = false
    @Published private(set) var isSpeaking = false
    @Published var errorMessage: String?

    private var items: [MobileDailyItem] = []
    private var settings = ListenSettings.default
    private var fileURL: (String) -> URL? = { _ in nil }
    private var audioPlayer: AVAudioPlayer?
    private var playerBox = AudioPlayerBox()
    private var runTask: Task<Void, Never>?
    private var finishWait: CheckedContinuation<Bool, Never>?
    private var remainingUntil: Date?
    private var frozenRemaining = 0
    private var tick: Timer?
    private var structureKey = ""

    var currentLine: CardLine? {
        guard playlist.indices.contains(clipIndex) else { return nil }
        guard isSpeaking else { return nil }
        return playlist[clipIndex].line
    }

    var currentItem: MobileDailyItem? {
        guard playlist.indices.contains(clipIndex) else { return nil }
        return items.first { $0.id == playlist[clipIndex].itemId }
    }

    var currentItemId: String? {
        currentItem?.id
    }

    var queueItems: [MobileDailyItem] {
        var seen = Set<String>()
        var ordered: [MobileDailyItem] = []
        for clip in playlist {
            if seen.contains(clip.itemId) { continue }
            seen.insert(clip.itemId)
            if let item = items.first(where: { $0.id == clip.itemId }) {
                ordered.append(item)
            }
        }
        return ordered
    }

    var currentTitle: String {
        currentItem?.displayTitle ?? "Sprachen Daily"
    }

    var currentSubtitle: String {
        currentItem?.nativeText ?? "Daily"
    }

    var sessionTotalMs: Int {
        ListenPlaylist.remainingMs(playlist, done: 1, playbackRate: settings.playbackRate)
    }

    func configure(
        items: [MobileDailyItem],
        settings: ListenSettings,
        fileURL: @escaping (String) -> URL?
    ) {
        self.items = items.filter { !$0.clips.isEmpty }
        self.fileURL = fileURL
        applySettings(settings, preservePosition: false)
    }

    func applySettings(_ settings: ListenSettings, preservePosition: Bool = true) {
        let previousId = currentItem?.id
        let key = settings.structureKey
        self.settings = settings
        audioPlayer?.enableRate = true
        audioPlayer?.rate = Float(settings.playbackRate)
        guard key != structureKey || playlist.isEmpty else {
            refreshRemaining(playing: !paused && !awaitingNext)
            updateNowPlaying()
            return
        }
        structureKey = key
        let wasPlaying = !paused && audioPlayer?.isPlaying == true
        stopRun()
        playlist = ListenPlaylist.build(items: self.items, settings: settings)
        clipIndex = 0
        if preservePosition, let previousId {
            if let found = playlist.firstIndex(where: { $0.itemId == previousId }) {
                clipIndex = found
            }
        }
        awaitingNext = false
        paused = true
        remainingUntil = nil
        frozenRemaining = ListenPlaylist.remainingMs(
            playlist,
            done: clipIndex + 1,
            playbackRate: settings.playbackRate
        )
        remainingMs = frozenRemaining
        ensureTick()
        NowPlayingController.shared.install(player: self)
        updateNowPlaying()
        if wasPlaying {
            play(from: clipIndex, skipPause: true)
        }
    }

    func toggleLoop() {
        loopCurrent.toggle()
        audioPlayer?.numberOfLoops = loopCurrent ? -1 : 0
    }

    func togglePause() {
        if awaitingNext {
            goNextSentence()
            return
        }
        if paused {
            play()
        } else {
            pause()
        }
    }

    func play() {
        guard !playlist.isEmpty else { return }
        if awaitingNext {
            goNextSentence()
            return
        }
        if let audioPlayer, paused, audioPlayer.currentTime > 0.05, !audioPlayer.isPlaying {
            paused = false
            configureSession()
            isSpeaking = true
            audioPlayer.play()
            refreshRemaining(playing: true)
            updateNowPlaying()
            resumeAfterCurrent()
            return
        }
        play(from: clipIndex, skipPause: true)
    }

    func pause() {
        paused = true
        isSpeaking = false
        audioPlayer?.pause()
        finishWait?.resume(returning: false)
        finishWait = nil
        runTask?.cancel()
        runTask = nil
        freezeRemaining()
        updateNowPlaying()
    }

    func goPrevSentence() {
        let bounds = ListenPlaylist.sentenceBounds(playlist, index: clipIndex)
        play(from: bounds.prevStart ?? bounds.start, skipPause: true)
    }

    func goNextSentence() {
        let bounds = ListenPlaylist.sentenceBounds(playlist, index: clipIndex)
        if let next = bounds.nextStart {
            play(from: next, skipPause: true)
            return
        }
        stopRun()
        clipIndex = 0
        paused = true
        audioPlayer?.stop()
        audioPlayer = nil
        freezeRemaining()
        updateNowPlaying()
    }

    func jumpToItem(_ id: String) {
        guard let index = playlist.firstIndex(where: { $0.itemId == id }) else { return }
        seek(to: index, paused: paused)
    }

    func seek(to index: Int, paused startPaused: Bool = false) {
        if startPaused {
            stopRun()
            clipIndex = min(max(0, index), max(playlist.count - 1, 0))
            paused = true
            refreshRemaining(playing: false)
            updateNowPlaying()
            return
        }
        play(from: index, skipPause: true)
    }

    func tearDown() {
        stopRun()
        audioPlayer?.stop()
        audioPlayer = nil
        tick?.invalidate()
        tick = nil
        isSpeaking = false
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    private func play(from index: Int, skipPause: Bool) {
        guard playlist.indices.contains(index) else { return }
        stopRun()
        clipIndex = index
        awaitingNext = false
        paused = false
        configureSession()
        refreshRemaining(playing: true)
        updateNowPlaying()
        runTask = Task { [weak self] in
            await self?.run(from: index, skipPause: skipPause)
        }
    }

    private func resumeAfterCurrent() {
        runTask?.cancel()
        runTask = Task { [weak self] in
            guard let self else { return }
            let finished = await self.waitForCurrentClip()
            guard !Task.isCancelled, finished, !self.paused else { return }
            await self.run(from: self.clipIndex + 1, skipPause: false)
        }
    }

    private func run(from start: Int, skipPause: Bool) async {
        var skipPause = skipPause
        var index = start
        while !Task.isCancelled, !paused, playlist.indices.contains(index) {
            clipIndex = index
            refreshRemaining(playing: true)
            updateNowPlaying()
            let clip = playlist[index]
            if !skipPause, clip.pauseBeforeMs > 0 {
                try? await Task.sleep(for: .milliseconds(clip.pauseBeforeMs))
                if Task.isCancelled || paused { return }
            }
            skipPause = false
            guard let url = fileURL(clip.url) else {
                errorMessage = "Audiodatei fehlt. Paket bitte neu laden."
                pause()
                return
            }
            do {
                let finished = try await playFile(url)
                if !finished || Task.isCancelled || paused { return }
            } catch {
                errorMessage = "Audio konnte nicht abgespielt werden."
                pause()
                return
            }

            if loopCurrent {
                skipPause = true
                continue
            }

            let next = index + 1
            if !settings.autoAdvance,
               playlist.indices.contains(next),
               playlist[next].sentenceKey != clip.sentenceKey {
                awaitingNext = true
                paused = true
                clipIndex = next
                freezeRemaining()
                updateNowPlaying()
                return
            }
            index = next
        }
        if !Task.isCancelled, !paused {
            clipIndex = 0
            paused = true
            audioPlayer = nil
            remainingMs = 0
            frozenRemaining = 0
            remainingUntil = nil
            updateNowPlaying()
        }
    }

    private func playFile(_ url: URL) async throws -> Bool {
        let player = try AVAudioPlayer(contentsOf: url)
        player.enableRate = true
        player.rate = Float(max(settings.playbackRate, 0.5))
        player.numberOfLoops = loopCurrent ? -1 : 0
        player.prepareToPlay()
        player.delegate = playerBox
        audioPlayer = player
        isSpeaking = true
        configureSession()
        player.play()
        updateNowPlaying()
        let finished = await waitForCurrentClip()
        if finished {
            isSpeaking = false
        }
        return finished
    }

    private func waitForCurrentClip() async -> Bool {
        await withCheckedContinuation { continuation in
            finishWait?.resume(returning: false)
            finishWait = continuation
            playerBox.onFinish = { [weak self] success in
                Task { @MainActor in
                    self?.finishWait?.resume(returning: success)
                    self?.finishWait = nil
                }
            }
        }
    }

    private func stopRun() {
        finishWait?.resume(returning: false)
        finishWait = nil
        runTask?.cancel()
        runTask = nil
        audioPlayer?.stop()
        audioPlayer = nil
        isSpeaking = false
    }

    private func ensureTick() {
        guard tick == nil else { return }
        tick = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.tickRemaining()
            }
        }
    }

    private func refreshRemaining(playing: Bool) {
        let leftover = ListenPlaylist.remainingMs(
            playlist,
            done: clipIndex + 1,
            playbackRate: settings.playbackRate
        )
        if playing {
            remainingUntil = Date().addingTimeInterval(Double(leftover) / 1000)
            remainingMs = leftover
        } else {
            remainingUntil = nil
            frozenRemaining = leftover
            remainingMs = leftover
        }
    }

    private func freezeRemaining() {
        if let remainingUntil {
            frozenRemaining = max(0, Int(remainingUntil.timeIntervalSinceNow * 1000))
        }
        remainingUntil = nil
        remainingMs = frozenRemaining
    }

    private func tickRemaining() {
        guard !paused, !awaitingNext, let remainingUntil else { return }
        remainingMs = max(0, Int(remainingUntil.timeIntervalSinceNow * 1000))
    }

    private func configureSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .spokenAudio, options: [])
            try session.setActive(true)
        } catch {
            errorMessage = "Audio-Session konnte nicht gestartet werden."
        }
    }

    private func updateNowPlaying() {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: currentTitle,
            MPMediaItemPropertyArtist: currentSubtitle,
            MPMediaItemPropertyAlbumTitle: "Sprachen Daily",
            MPNowPlayingInfoPropertyPlaybackRate: paused ? 0 : settings.playbackRate,
        ]
        if let audioPlayer {
            info[MPMediaItemPropertyPlaybackDuration] = audioPlayer.duration
            info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = audioPlayer.currentTime
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
