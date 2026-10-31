import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showServerSettings = false

    var body: some View {
        Group {
            if model.hello != nil, let url = model.configuration.baseURL {
                DashboardWebView(baseURL: url, token: model.configuration.token)
                    .id(url.absoluteString + "|" + model.configuration.token)
                    .ignoresSafeArea(.container, edges: .bottom)
                    .overlay(alignment: .topTrailing) {
                        Button {
                            showServerSettings = true
                        } label: {
                            Image(systemName: "server.rack")
                                .font(.system(size: 15, weight: .semibold))
                                .frame(width: 34, height: 34)
                                .background(.black.opacity(0.72), in: Circle())
                                .foregroundStyle(.white)
                        }
                        .accessibilityLabel("Serverinstellingen")
                        .padding(.top, 8)
                        .padding(.trailing, 12)
                    }
            } else {
                NavigationStack { SettingsView() }
            }
        }
        .sheet(isPresented: $showServerSettings) {
            NavigationStack {
                SettingsView()
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Gereed") { showServerSettings = false }
                        }
                    }
            }
        }
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

