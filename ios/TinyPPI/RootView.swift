import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showServerSettings = false
    @State private var selectedTab = DashboardTab.live
    @State private var detailIsOpen = false
    @State private var tabBarIsHidden = false

    var body: some View {
        Group {
            if model.hello != nil, let url = model.configuration.baseURL {
                DashboardWebView(
                    baseURL: url,
                    token: model.configuration.token,
                    selectedTab: selectedTab.rawValue,
                    onDetailVisibilityChanged: { detailIsOpen = $0 },
                    onTabBarVisibilityChanged: { tabBarIsHidden = $0 }
                )
                    .id(url.absoluteString + "|" + model.configuration.token)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .ignoresSafeArea(.container, edges: .bottom)
                    .overlay(alignment: .bottom) {
                        DashboardTabBar(selection: $selectedTab) {
                            showServerSettings = true
                        }
                        .padding(.horizontal, 18)
                        .offset(y: detailIsOpen || tabBarIsHidden ? 120 : 10)
                        .opacity(detailIsOpen || tabBarIsHidden ? 0 : 1)
                        .allowsHitTesting(!detailIsOpen && !tabBarIsHidden)
                    }
                    .animation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.52), value: detailIsOpen)
                    .animation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.52), value: tabBarIsHidden)
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
                            .font(.system(size: 16, weight: .semibold))
                            .frame(width: 22, height: 19, alignment: .center)
                        Text(tab.title)
                            .font(.system(size: 8.5, weight: .medium))
                            .lineLimit(1)
                            .frame(height: 10, alignment: .center)
                    }
                    .foregroundStyle(selection == tab ? Color.orange : Color.secondary)
                    .frame(maxWidth: .infinity, minHeight: 46, maxHeight: 46, alignment: .center)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selection == tab ? .isSelected : [])
            }
        }
        .padding(.horizontal, 5)
        .padding(.vertical, 2)
        .background(Color(red: 0.105, green: 0.125, blue: 0.14))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Color.white.opacity(0.09), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.28), radius: 9, y: 3)
    }
}

