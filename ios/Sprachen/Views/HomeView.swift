import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var settings: AppSettingsStore
    @EnvironmentObject private var player: ListenPlayer
    @Environment(\.colorScheme) private var colorScheme
    @State private var settingsOpen = false
    @State private var listenSettingsOpen = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                header
                content
                PlayerDock(listenSettingsOpen: $listenSettingsOpen)
            }
            .background(CahierBackground())
            .navigationBarHidden(true)
            .sheet(isPresented: $settingsOpen) {
                ServerSettingsView()
                    .environmentObject(model)
                    .environmentObject(model.settings)
            }
            .sheet(isPresented: $listenSettingsOpen) {
                ListenSettingsSheet()
                    .environmentObject(model)
            }
            .task {
                model.loadStoredPack()
                await model.probeServer()
            }
            .onChange(of: player.errorMessage) { _, message in
                if let message {
                    model.banner = message
                    player.errorMessage = nil
                }
            }
        }
        .environment(\.cahier, CahierTheme(resolvedScheme))
        .tint(CahierTheme(resolvedScheme).ink)
        .preferredColorScheme(settings.appearance.preferredColorScheme)
    }

    private var resolvedScheme: ColorScheme {
        settings.appearance.preferredColorScheme ?? colorScheme
    }

    private var theme: CahierTheme { CahierTheme(resolvedScheme) }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Daily")
                    .font(.headline)
                    .foregroundStyle(theme.ink)
                Text(model.statusLine)
                    .font(.caption)
                    .foregroundStyle(theme.muted)
                    .lineLimit(2)
            }

            Spacer(minLength: 8)

            Menu {
                ForEach(settings.targetLangs) { lang in
                    Button {
                        model.selectLanguage(lang.code)
                    } label: {
                        HStack {
                            Text("\(lang.flag) \(lang.name)")
                            if lang.code == settings.targetLang {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(model.currentLang.flag)
                        .font(.title)
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(theme.muted)
                }
                .padding(.vertical, 6)
            }
            .accessibilityLabel("Zielsprache")

            Button {
                Task { await model.downloadCurrentPack() }
            } label: {
                Group {
                    if case let .saving(done, total) = model.downloadPhase {
                        ProgressView(value: total > 0 ? Double(done) / Double(total) : 0)
                    } else if model.downloadPhase == .done {
                        Image(systemName: "checkmark.circle.fill")
                    } else {
                        Image(systemName: "arrow.down.circle")
                    }
                }
                .font(.system(size: 28, weight: .regular))
                .foregroundStyle(theme.ink)
                .frame(width: 36, height: 36)
            }
            .accessibilityLabel("Aktuelles Paket laden")
            .disabled(model.downloadPhase != .idle)

            Button {
                settingsOpen = true
            } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 26, weight: .regular))
                    .foregroundStyle(theme.ink)
                    .frame(width: 36, height: 36)
            }
            .accessibilityLabel("Einstellungen")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(theme.paper.opacity(0.92))
        .overlay(alignment: .bottom) {
            theme.ink.opacity(0.08).frame(height: 1)
        }
    }

    @ViewBuilder
    private var content: some View {
        if let banner = model.banner {
            Text(banner)
                .font(.footnote)
                .foregroundStyle(theme.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(theme.section, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .onTapGesture { model.banner = nil }
        }

        if let item = player.currentItem {
            GeometryReader { geo in
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if !item.badges.isEmpty {
                            HStack(spacing: 6) {
                                ForEach(item.badges, id: \.self) { badge in
                                    Text(badge)
                                        .font(.caption.weight(.medium))
                                        .foregroundStyle(theme.ink)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(theme.paper, in: Capsule())
                                        .overlay(
                                            Capsule().stroke(theme.ink.opacity(0.12), lineWidth: 1)
                                        )
                                }
                            }
                            .padding(.leading, 4)
                        }

                        if item.nativeIntro != nil || item.targetIntro != nil {
                            CahierCard {
                                VStack(alignment: .leading, spacing: 10) {
                                    if let intro = item.nativeIntro {
                                        SpokenLine(
                                            text: intro,
                                            font: .title.weight(.semibold),
                                            active: player.currentLine == .nativeIntro
                                        )
                                    }
                                    if let intro = item.targetIntro {
                                        SpokenLine(
                                            text: intro,
                                            font: .title,
                                            active: player.currentLine == .targetIntro
                                        )
                                    }
                                }
                            }
                        }

                        CahierCard {
                            VStack(alignment: .leading, spacing: 12) {
                                SpokenLine(
                                    text: item.nativeText,
                                    font: .title.weight(.semibold),
                                    active: player.currentLine == .nativeCard
                                )
                                SpokenLine(
                                    text: item.displayTitle,
                                    font: .title,
                                    active: player.currentLine == .targetCard
                                )
                            }
                        }
                    }
                    .padding(.leading, 36)
                    .padding(.trailing, 16)
                    .padding(.vertical, 20)
                    .frame(minHeight: geo.size.height, alignment: .center)
                }
            }
        } else {
            VStack(spacing: 12) {
                Image(systemName: "headphones")
                    .font(.system(size: 36))
                    .foregroundStyle(theme.ink.opacity(0.45))
                Text(model.statusLine)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(theme.muted)
                    .padding(.horizontal, 24)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}
