import SwiftUI

struct PlayerDock: View {
    @EnvironmentObject private var player: ListenPlayer
    @Environment(\.cahier) private var theme
    @Binding var listenSettingsOpen: Bool

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Text(formatClock(player.remainingMs))
                    .font(.caption.monospacedDigit())
                Spacer()
                Text(formatClock(player.sessionTotalMs))
                    .font(.caption.monospacedDigit())
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
        .background(theme.paper.opacity(0.94))
        .overlay(alignment: .top) {
            theme.ink.opacity(0.08).frame(height: 1)
        }
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
