import SwiftUI

private struct DockChromeHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 140
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

struct PlayerDock: View {
    @EnvironmentObject private var player: ListenPlayer
    @Environment(\.cahier) private var theme
    @Binding var listenSettingsOpen: Bool
    var availableHeight: CGFloat
    @State private var playlistOpen = false
    @State private var chromeHeight: CGFloat = 140

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            VStack(spacing: 0) {
                if playlistOpen, !queueItems.isEmpty {
                    PlaylistPanel(
                        items: queueItems,
                        currentItemId: player.currentItemId,
                        currentIndex: currentQueueIndex,
                        onJump: { player.jumpToItem($0) }
                    )
                    .frame(maxHeight: .infinity)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                controls
                    .background {
                        GeometryReader { chrome in
                            Color.clear.preference(
                                key: DockChromeHeightKey.self,
                                value: chrome.size.height
                            )
                        }
                    }
            }
            .frame(maxHeight: playlistOpen && availableHeight > 0 ? availableHeight : nil)
            .frame(maxWidth: .infinity)
            .background(theme.paper.opacity(0.94))
            .overlay(alignment: .top) {
                theme.ink.opacity(0.08).frame(height: 1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: availableHeight, alignment: .bottom)
        .overlay(alignment: .bottomTrailing) {
            if !queueItems.isEmpty {
                playlistButton
            }
        }
        .onPreferenceChange(DockChromeHeightKey.self) { chromeHeight = $0 }
        .animation(.spring(response: 0.34, dampingFraction: 0.86), value: playlistOpen)
    }

    private var queueItems: [MobileDailyItem] { player.queueItems }

    private var currentQueueIndex: Int {
        guard let id = player.currentItemId else { return -1 }
        return queueItems.firstIndex(where: { $0.id == id }) ?? -1
    }

    private var playlistLabel: String {
        let current = currentQueueIndex >= 0 ? currentQueueIndex + 1 : 0
        return "\(current) / \(queueItems.count)"
    }

    private var playlistButton: some View {
        Button {
            playlistOpen.toggle()
        } label: {
            Image(systemName: playlistOpen ? "xmark" : "list.bullet")
                .font(.body.weight(.semibold))
                .foregroundStyle(theme.buttonLabel)
                .frame(width: 48, height: 48)
                .background(theme.buttonFill, in: Circle())
                .shadow(color: theme.ink.opacity(theme.isDark ? 0.28 : 0.22), radius: 10, y: 4)
        }
        .accessibilityLabel(playlistOpen ? "Playlist schließen" : "Playlist öffnen")
        .padding(.trailing, 16)
        .padding(.bottom, chromeHeight + 10)
        .zIndex(20)
    }

    private var controls: some View {
        VStack(spacing: 10) {
            ZStack {
                HStack {
                    Text(formatClock(player.remainingMs))
                        .font(.caption.monospacedDigit())
                    Spacer()
                    Text(formatClock(player.sessionTotalMs))
                        .font(.caption.monospacedDigit())
                }
                if !queueItems.isEmpty {
                    Text(playlistLabel)
                        .font(.caption.monospacedDigit().weight(.semibold))
                }
            }
            .foregroundStyle(theme.muted)

            ZStack {
                HStack(spacing: 28) {
                    transportButton(systemName: "backward.fill", disabled: player.playlist.isEmpty) {
                        player.goPrevSentence()
                    }
                    playButton
                    transportButton(systemName: "forward.fill", disabled: player.playlist.isEmpty) {
                        player.goNextSentence()
                    }
                }
                .frame(maxWidth: .infinity)

                HStack {
                    Button {
                        player.toggleLoop()
                    } label: {
                        Image(systemName: player.loopCurrent ? "repeat.1" : "repeat")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(player.loopCurrent ? theme.marginRed : theme.ink)
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Aktuelles Audio wiederholen")
                    .disabled(player.playlist.isEmpty)
                    .opacity(player.playlist.isEmpty ? 0.35 : 1)

                    Spacer()

                    Button {
                        listenSettingsOpen = true
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(theme.ink)
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Wiedergabe")
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 16)
    }

    private var playButton: some View {
        Button {
            player.togglePause()
        } label: {
            ZStack {
                Circle()
                    .fill(theme.buttonFill)
                    .shadow(color: theme.ink.opacity(theme.isDark ? 0.18 : 0.22), radius: 10, y: 4)
                if player.buffering {
                    ProgressView()
                        .tint(theme.buttonLabel)
                } else {
                    Image(systemName: player.paused || player.awaitingNext ? "play.fill" : "pause.fill")
                        .font(.system(size: 28, weight: .semibold))
                        .foregroundStyle(theme.buttonLabel)
                        .offset(x: player.paused || player.awaitingNext ? 2 : 0)
                }
            }
            .frame(width: 72, height: 72)
        }
        .disabled(player.playlist.isEmpty)
        .accessibilityLabel(player.paused || player.awaitingNext ? "Abspielen" : "Pause")
    }

    private func transportButton(
        systemName: String,
        disabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.title2)
                .foregroundStyle(theme.ink)
                .frame(width: 48, height: 48)
        }
        .disabled(disabled)
        .opacity(disabled ? 0.35 : 1)
    }

    private func formatClock(_ ms: Int) -> String {
        let total = max(0, Int((Double(ms) / 1000).rounded()))
        let minutes = total / 60
        let seconds = total % 60
        return "\(minutes):\(String(format: "%02d", seconds))"
    }
}

private struct PlaylistPanel: View {
    @Environment(\.cahier) private var theme
    var items: [MobileDailyItem]
    var currentItemId: String?
    var currentIndex: Int
    var onJump: (String) -> Void

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 4) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        PlaylistRow(
                            index: index,
                            item: item,
                            active: item.id == currentItemId,
                            past: currentIndex >= 0 && index < currentIndex
                        ) {
                            onJump(item.id)
                        }
                        .id(item.id)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 12)
            }
            .onAppear { scrollToCurrent(proxy) }
            .onChange(of: currentItemId) { _, _ in
                scrollToCurrent(proxy)
            }
        }
    }

    private func scrollToCurrent(_ proxy: ScrollViewProxy) {
        guard let currentItemId else { return }
        withAnimation(.easeInOut(duration: 0.25)) {
            proxy.scrollTo(currentItemId, anchor: .center)
        }
    }
}

private struct PlaylistRow: View {
    @Environment(\.cahier) private var theme
    var index: Int
    var item: MobileDailyItem
    var active: Bool
    var past: Bool
    var onJump: () -> Void

    var body: some View {
        Button(action: onJump) {
            HStack(alignment: .top, spacing: 10) {
                Text("\(index + 1)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(theme.muted)
                    .frame(width: 22, alignment: .trailing)
                    .padding(.top, 2)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.displayTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(theme.ink)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    if !item.nativeText.isEmpty {
                        Text(item.nativeText)
                            .font(.caption)
                            .foregroundStyle(theme.muted)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(active ? theme.ink.opacity(theme.isDark ? 0.18 : 0.08) : .clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(active ? theme.ink.opacity(0.55) : .clear, lineWidth: 1.5)
            )
            .opacity(past && !active ? 0.45 : 1)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Satz \(index + 1), \(item.displayTitle)")
        .accessibilityAddTraits(active ? .isSelected : [])
    }
}
