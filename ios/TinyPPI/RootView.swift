import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showServerSettings = false
    @State private var selectedTab = DashboardTab.live
    @State private var detailIsOpen = false

    var body: some View {
        Group {
            if model.hello != nil, let url = model.configuration.baseURL {
                DashboardWebView(
                    baseURL: url,
                    token: model.configuration.token,
                    selectedTab: selectedTab.rawValue,
                    onDetailVisibilityChanged: { detailIsOpen = $0 }
                )
                    .id(url.absoluteString + "|" + model.configuration.token)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        if !detailIsOpen {
                            DashboardTabBar(selection: $selectedTab) {
                                showServerSettings = true
                            }
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                        }
                    }
                    .animation(.easeInOut(duration: 0.2), value: detailIsOpen)
                    .ignoresSafeArea(
                        .container,
                        edges: detailIsOpen ? .bottom : Edge.Set()
                    )
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
    case live, films, series, metadata, history, settings
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
    let openServerSettings: () -> Void
    var body: some View {
        HStack(spacing: 2) {
            ForEach(DashboardTab.allCases) { tab in
                Button {
                    if tab == .settings {
                        openServerSettings()
                    } else {
                        selection = tab
                    }
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: tab.icon)
                            .font(.system(size: 18, weight: .semibold))
                            .frame(width: 26, height: 22, alignment: .center)
                        Text(tab.title)
                            .font(.system(size: 9, weight: .medium))
                            .lineLimit(1)
                            .frame(height: 12, alignment: .center)
                    }
                    .foregroundStyle(selection == tab ? Color.orange : Color.secondary)
                    .frame(maxWidth: .infinity, minHeight: 54, maxHeight: 54, alignment: .center)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selection == tab ? .isSelected : [])
            }
        }
        .padding(.horizontal, 6)
        .background(Color(red: 0.105, green: 0.125, blue: 0.14))
        .overlay(alignment: .top) { Divider() }
    }
}

