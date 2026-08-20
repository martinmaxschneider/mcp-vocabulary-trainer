import SwiftUI

struct ServerSettingsView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var settings: AppSettingsStore
    @Environment(\.dismiss) private var dismiss
    @State private var checking = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("http://192.168.1.10:4810", text: $settings.serverURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    Button {
                        Task { await check() }
                    } label: {
                        if checking {
                            ProgressView()
                        } else {
                            Text("Verbindung prüfen")
                        }
                    }
                    .disabled(checking)
                } header: {
                    Text("Mac-Adresse")
                } footer: {
                    Text("Dieselbe Adresse wie im Heim-WLAN, Port 4810. HTTPS und Zertifikate sind für die App nicht nötig.")
                }

                Section {
                    Picker("Darstellung", selection: $settings.appearance) {
                        ForEach(AppearanceMode.allCases) { mode in
                            Text(mode.title).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                } header: {
                    Text("Darstellung")
                } footer: {
                    Text("Hell ist der weiße Cahier-Modus, Dunkel der nächtliche. System folgt dem iPhone.")
                }

                Section("Status") {
                    HStack {
                        Text("Mac erreichbar")
                        Spacer()
                        statusLabel
                    }
                    if let pack = model.pack {
                        LabeledContent("Gespeichertes Paket", value: pack.date)
                        LabeledContent("Sprache", value: pack.targetLang)
                        LabeledContent("Sätze", value: "\(pack.items.count)")
                    } else {
                        Text("Noch kein Paket auf diesem Gerät.")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .preferredColorScheme(settings.appearance.preferredColorScheme)
            .navigationTitle("Einstellungen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig") { dismiss() }
                }
            }
        }
    }

    @ViewBuilder
    private var statusLabel: some View {
        switch model.serverReachable {
        case true:
            Text("Ja").foregroundStyle(.green)
        case false:
            Text("Nein").foregroundStyle(.red)
        case nil:
            Text("–").foregroundStyle(.secondary)
        }
    }

    private func check() async {
        checking = true
        defer { checking = false }
        await model.probeServer()
        if model.serverReachable == true {
            model.banner = "Mac ist erreichbar."
        } else if settings.normalizedBaseURL == nil {
            model.banner = MobileAPIError.missingServer.localizedDescription
        } else {
            model.banner = "Mac nicht erreichbar. Gleicher WLAN und Adresse prüfen."
        }
    }
}
