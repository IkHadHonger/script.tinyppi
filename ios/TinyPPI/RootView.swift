import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        TabView {
            NavigationStack { LiveView() }
                .tabItem { Label("Live", systemImage: "waveform.path.ecg") }
            NavigationStack { PlayerView() }
                .tabItem { Label("Player", systemImage: "play.circle.fill") }
            NavigationStack { SettingsView() }
                .tabItem { Label("Instellingen", systemImage: "gearshape.fill") }
        }
        .tint(.orange)
        .overlay(alignment: .top) {
            if let message = model.errorMessage {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.white)
                    .padding(10)
                    .background(.red.opacity(0.92), in: Capsule())
                    .padding(.top, 8)
                    .onTapGesture { model.errorMessage = nil }
            }
        }
    }
}

