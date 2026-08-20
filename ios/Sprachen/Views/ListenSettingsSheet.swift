import SwiftUI

struct ListenSettingsSheet: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ListenSettings.default

    var body: some View {
        NavigationStack {
            Form {
                Section("Pause zwischen Clips") {
                    Stepper(
                        value: $draft.pauseMs,
                        in: ListenSettings.pauseRange,
                        step: ListenSettings.pauseStep
                    ) {
                        Text("\(draft.pauseMs) ms")
                    }
                }
                Section("Tempo") {
                    Picker("Tempo", selection: $draft.playbackRate) {
                        ForEach(ListenSettings.rateOptions, id: \.self) { rate in
                            Text(rateLabel(rate)).tag(rate)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                Section("Wiederholungen") {
                    Picker("Satz", selection: $draft.repeatsPerSentence) {
                        ForEach(ListenSettings.sentenceRepeatOptions, id: \.self) { value in
                            Text("\(value)×").tag(value)
                        }
                    }
                    Picker("Liste", selection: $draft.listRepeats) {
                        ForEach(ListenSettings.listRepeatOptions, id: \.self) { value in
                            Text("\(value)×").tag(value)
                        }
                    }
                }
                Section {
                    Toggle("Automatisch weiter", isOn: $draft.autoAdvance)
                    Toggle("Zielsprache nur einmal", isOn: $draft.mainLangOnce)
                }
            }
            .navigationTitle("Wiedergabe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fertig") { dismiss() }
                }
            }
            .onAppear { draft = model.settings.listenSettings }
            .onChange(of: draft) { _, next in
                model.applyListenSettings(next)
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func rateLabel(_ rate: Double) -> String {
        if rate == 1 { return "1×" }
        return String(format: "%.2g×", rate)
    }
}
