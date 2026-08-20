import SwiftUI

@main
struct SprachenApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            HomeView()
                .environmentObject(model)
                .environmentObject(model.settings)
                .environmentObject(model.player)
                .preferredColorScheme(model.settings.appearance.preferredColorScheme)
        }
    }
}
