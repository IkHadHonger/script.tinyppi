import SwiftUI

struct PlayerView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(spacing: 28) {
            Spacer()
            Image(systemName: model.state?.paused == true ? "pause.circle.fill" : "play.circle.fill")
                .font(.system(size: 84)).foregroundStyle(.orange)
            Text(model.state?.title.nonEmpty ?? "Geen actieve speler")
                .font(.title3.bold()).multilineTextAlignment(.center)
            if let state = model.state, state.playing {
                HStack { Text(state.time); Spacer(); Text(state.duration) }
                    .font(.body.monospacedDigit()).foregroundStyle(.secondary)
                HStack(spacing: 30) {
                    ControlButton(icon: "gobackward.30", label: "30 sec terug") { await model.send("seek", value: -30) }
                    ControlButton(icon: state.paused ? "play.fill" : "pause.fill", label: state.paused ? "Afspelen" : "Pauze") { await model.send("playpause") }
                    ControlButton(icon: "goforward.30", label: "30 sec vooruit") { await model.send("seek", value: 30) }
                }
                Button(role: .destructive) { Task { await model.send("stop") } } label: {
                    Label("Stoppen", systemImage: "stop.fill").padding(.horizontal, 28).padding(.vertical, 12)
                }
                .buttonStyle(.bordered)
                .disabled(state.control == false)
            }
            Spacer()
        }
        .padding(24)
        .navigationTitle("Player")
    }
}

private struct ControlButton: View {
    let icon: String
    let label: String
    let action: () async -> Void
    var body: some View {
        Button { Task { await action() } } label: {
            VStack(spacing: 8) { Image(systemName: icon).font(.title); Text(label).font(.caption) }
                .frame(minWidth: 72)
        }
        .buttonStyle(.borderless)
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}

