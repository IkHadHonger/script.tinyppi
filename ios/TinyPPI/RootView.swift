import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showServerSettings = false
    @State private var selectedTab = DashboardTab.live

    var body: some View {
        Group {
            if model.hello != nil, let url = model.configuration.baseURL {
                DashboardWebView(baseURL: url, token: model.configuration.token, selectedTab: selectedTab.rawValue)
                    .id(url.absoluteString + "|" + model.configuration.token)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        DashboardTabBar(selection: $selectedTab)
                    }
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

private enum DashboardTab: String, CaseIterable, Identifiable {
    case live, metadata, films, series, history, settings
    var id: String { rawValue }
    var title: String {
        switch self {
        case .live: return "Live"
        case .metadata: return "Metadata"
        case .films: return "Films"
        case .series: return "Series"
        case .history: return "Historie"
        case .settings: return "Instellingen"
        }
    }
    var icon: String {
        switch self {
        case .live: return "waveform.path.ecg"
        case .metadata: return "viewfinder"
        case .films: return "film.stack"
        case .series: return "rectangle.stack"
        case .history: return "chart.xyaxis.line"
        case .settings: return "gearshape"
        }
    }
}

private struct DashboardTabBar: View {
    @Binding var selection: DashboardTab
    var body: some View {
        HStack(spacing: 2) {
            ForEach(DashboardTab.allCases) { tab in
                Button {
                    selection = tab
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: tab.icon).font(.system(size: 18, weight: .semibold))
                        Text(tab.title).font(.system(size: 9, weight: .medium)).lineLimit(1)
                    }
                    .foregroundStyle(selection == tab ? Color.orange : Color.secondary)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selection == tab ? .isSelected : [])
            }
        }
        .padding(.horizontal, 6)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Divider() }
    }
}

