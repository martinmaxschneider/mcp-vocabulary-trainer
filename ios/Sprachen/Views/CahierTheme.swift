import SwiftUI

enum AppearanceMode: String, Codable, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: "System"
        case .light: "Hell"
        case .dark: "Dunkel"
        }
    }

    var preferredColorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

struct CahierTheme: Equatable {
    var isDark: Bool

    init(_ scheme: ColorScheme) {
        isDark = scheme == .dark
    }

    var sheet: Color {
        isDark
            ? Color(red: 16 / 255, green: 24 / 255, blue: 32 / 255)
            : Color(red: 238 / 255, green: 244 / 255, blue: 250 / 255)
    }

    var grid: Color {
        isDark
            ? Color(red: 110 / 255, green: 145 / 255, blue: 180 / 255).opacity(0.12)
            : Color(red: 147 / 255, green: 174 / 255, blue: 196 / 255).opacity(0.35)
    }

    var paper: Color {
        isDark
            ? Color(red: 27 / 255, green: 38 / 255, blue: 54 / 255)
            : Color.white
    }

    var ink: Color {
        isDark
            ? Color(red: 220 / 255, green: 231 / 255, blue: 244 / 255)
            : Color(red: 30 / 255, green: 58 / 255, blue: 95 / 255)
    }

    var muted: Color {
        isDark
            ? Color(red: 154 / 255, green: 173 / 255, blue: 194 / 255)
            : Color(red: 71 / 255, green: 85 / 255, blue: 105 / 255)
    }

    var section: Color {
        isDark
            ? Color(red: 10 / 255, green: 16 / 255, blue: 26 / 255).opacity(0.72)
            : Color(red: 220 / 255, green: 232 / 255, blue: 244 / 255).opacity(0.8)
    }

    var marginRed: Color {
        isDark
            ? Color(red: 208 / 255, green: 122 / 255, blue: 122 / 255)
            : Color(red: 212 / 255, green: 93 / 255, blue: 93 / 255)
    }

    var buttonFill: Color {
        isDark
            ? Color(red: 213 / 255, green: 227 / 255, blue: 244 / 255)
            : Color(red: 30 / 255, green: 58 / 255, blue: 95 / 255)
    }

    var buttonLabel: Color {
        isDark
            ? Color(red: 18 / 255, green: 25 / 255, blue: 34 / 255)
            : Color.white
    }

    static let gridSize: CGFloat = 22
    static let marginX: CGFloat = 28
}

private struct CahierThemeKey: EnvironmentKey {
    static let defaultValue = CahierTheme(.light)
}

extension EnvironmentValues {
    var cahier: CahierTheme {
        get { self[CahierThemeKey.self] }
        set { self[CahierThemeKey.self] = newValue }
    }
}

struct CahierBackground: View {
    @Environment(\.cahier) private var theme

    var body: some View {
        ZStack(alignment: .leading) {
            theme.sheet
            CahierGrid(color: theme.grid)
            theme.marginRed
                .frame(width: 2)
                .padding(.leading, CahierTheme.marginX)
                .allowsHitTesting(false)
        }
        .ignoresSafeArea()
    }
}

private struct CahierGrid: View {
    var color: Color

    var body: some View {
        Canvas { context, size in
            let step = CahierTheme.gridSize
            var path = Path()
            var x: CGFloat = 0
            while x <= size.width {
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: size.height))
                x += step
            }
            var y: CGFloat = 0
            while y <= size.height {
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                y += step
            }
            context.stroke(path, with: .color(color), lineWidth: 1)
        }
        .allowsHitTesting(false)
    }
}

struct SpokenLine: View {
    @Environment(\.cahier) private var theme
    var text: String
    var font: Font
    var active: Bool

    var body: some View {
        Text(text)
            .font(font)
            .foregroundStyle(active ? (theme.isDark ? Color.white : theme.ink) : theme.muted.opacity(0.55))
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct CahierCard<Content: View>: View {
    @Environment(\.cahier) private var theme
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .background(theme.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(theme.ink.opacity(theme.isDark ? 0.16 : 0.1), lineWidth: 1)
            )
    }
}
