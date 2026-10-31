import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var editor: SettingsEditor?
    @State private var connectionTest: ConnectionTestResult?

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                serverCard
                settingsSections
                Text("TinyPPI iOS 1.5.3  •  Backend 2.22.0")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 18)
            .padding(.top, 10)
            .padding(.bottom, 32)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Instellingen")
        .navigationBarTitleDisplayMode(.large)
        .sheet(item: $editor) { editor in
            NavigationStack {
                ServerEditorView(configuration: model.configuration, mode: editor) { configuration in
                    model.updateConfiguration(configuration)
                    connectionTest = nil
                    Task { _ = await model.connect() }
                }
                .environmentObject(model)
            }
        }
        .onAppear {
            if model.configuration.host.isEmpty { editor = .all }
        }
    }

    private var serverCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 12) {
                Image(systemName: "server.rack")
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(.orange)
                    .frame(width: 42, height: 42)
                    .background(.orange.opacity(0.14), in: RoundedRectangle(cornerRadius: 12))

                VStack(alignment: .leading, spacing: 3) {
                    Text(model.hello?.name ?? "TinyPPI-server").font(.headline)
                    Text(serverAddress)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                connectionBadge
            }

            if let hello = model.hello {
                HStack(spacing: 0) {
                    statusValue("API", value: hello.version)
                    Divider().frame(height: 30)
                    statusValue("Bediening", value: hello.control ? "Toegestaan" : "Alleen lezen")
                }
            }

            HStack(spacing: 10) {
                Button {
                    connectionTest = nil
                    Task {
                        let succeeded = await model.connect()
                        withAnimation(.easeInOut(duration: 0.2)) {
                            connectionTest = succeeded ? .success : .failure
                        }
                    }
                } label: {
                    HStack(spacing: 7) {
                        if model.isConnecting { ProgressView().controlSize(.small) }
                        else { Image(systemName: "arrow.clockwise") }
                        Text(model.hello == nil ? "Verbinden" : "Test verbinding")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(TinyPPIButtonStyle(filled: true))
                .disabled(model.configuration.host.isEmpty || model.isConnecting)

                Button("Wijzig") { editor = .all }
                    .buttonStyle(TinyPPIButtonStyle(filled: false))
            }

            if let connectionTest {
                Label(connectionTest.message, systemImage: connectionTest.icon)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(connectionTest.color)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(18)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22))
        .overlay { RoundedRectangle(cornerRadius: 22).strokeBorder(.primary.opacity(0.06)) }
    }

    private var settingsSections: some View {
        VStack(spacing: 22) {
            SettingsGroup(title: "SERVER") {
                SettingsRow(icon: "server.rack", tint: .orange, title: "Serververbinding", value: serverAddress) {
                    editor = .server
                }
                Divider().padding(.leading, 48)
                SettingsRow(icon: "key.fill", tint: .blue, title: "Toegangstoken", value: model.configuration.token.isEmpty ? "Niet ingesteld" : "Ingesteld") {
                    editor = .token
                }
            }

            if let url = model.configuration.baseURL {
                SettingsGroup(title: "DASHBOARD") {
                    NavigationLink {
                        AdvancedDashboardSettingsView(baseURL: url, token: model.configuration.token)
                    } label: {
                        SettingsRowLabel(
                            icon: "rectangle.3.group.fill",
                            tint: .teal,
                            title: "Boxen en dashboard",
                            value: "Geavanceerd"
                        )
                    }
                    .buttonStyle(.plain)
                }
            }

            SettingsGroup(title: "APP") {
                NavigationLink {
                    PrivacyNetworkView()
                } label: {
                    SettingsRowLabel(icon: "hand.raised.fill", tint: .indigo, title: "Privacy en netwerk")
                }
                .buttonStyle(.plain)
                Divider().padding(.leading, 48)
                NavigationLink {
                    AboutTinyPPIView()
                } label: {
                    SettingsRowLabel(icon: "info.circle.fill", tint: .gray, title: "Over TinyPPI")
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var serverAddress: String {
        guard !model.configuration.host.isEmpty else { return "Nog niet ingesteld" }
        return "\(model.configuration.host):\(model.configuration.port)"
    }

    private var connectionBadge: some View {
        HStack(spacing: 6) {
            Circle().fill(model.hello == nil ? Color.secondary : Color.green).frame(width: 8, height: 8)
            Text(model.hello == nil ? "Niet verbonden" : "Verbonden").font(.caption.weight(.semibold))
        }
        .foregroundStyle(model.hello == nil ? Color.secondary : Color.green)
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background((model.hello == nil ? Color.secondary : Color.green).opacity(0.12), in: Capsule())
    }

    private func statusValue(_ label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.subheadline.weight(.semibold)).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
    }
}

private enum SettingsEditor: String, Identifiable {
    case server, token, all
    var id: String { rawValue }
    var title: String {
        switch self {
        case .server: return "Serververbinding"
        case .token: return "Toegangstoken"
        case .all: return "Verbinding wijzigen"
        }
    }
}

private enum ConnectionTestResult {
    case success, failure
    var message: String { self == .success ? "Verbinding geslaagd" : "Verbinding mislukt" }
    var icon: String { self == .success ? "checkmark.circle.fill" : "xmark.circle.fill" }
    var color: Color { self == .success ? .green : .red }
}

private struct ServerEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var model: AppModel
    @State private var configuration: ServerConfiguration
    @State private var showsToken = false
    let mode: SettingsEditor
    let onSave: (ServerConfiguration) -> Void

    init(configuration: ServerConfiguration, mode: SettingsEditor, onSave: @escaping (ServerConfiguration) -> Void) {
        _configuration = State(initialValue: configuration)
        self.mode = mode
        self.onSave = onSave
    }

    var body: some View {
        Form {
            Section {
                if mode != .token {
                    TextField("IP-adres of hostnaam", text: $configuration.host)
                        .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                    TextField("Poort", value: $configuration.port, format: .number).keyboardType(.numberPad)
                }
                if mode != .server {
                    HStack {
                        Group {
                            if showsToken { TextField("Toegangstoken", text: $configuration.token) }
                            else { SecureField("Toegangstoken", text: $configuration.token) }
                        }
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        Button { showsToken.toggle() } label: {
                            Image(systemName: showsToken ? "eye.slash" : "eye").foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(showsToken ? "Token verbergen" : "Token tonen")
                    }
                }
            } header: {
                Text(mode == .token ? "Beveiliging" : "TinyPPI-server")
            } footer: {
                Text(editorHelp)
            }

            if mode == .all && !model.configuration.host.isEmpty {
                Section {
                    Button("Verbinding verwijderen", role: .destructive) {
                        model.removeConfiguration()
                        configuration = ServerConfiguration()
                        dismiss()
                    }
                }
            }
        }
        .navigationTitle(mode.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Annuleer") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Bewaar") {
                    onSave(configuration)
                    dismiss()
                }
                .fontWeight(.semibold)
                .disabled(mode != .token && configuration.host.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    private var editorHelp: String {
        switch mode {
        case .server: return "Vul het IP-adres of de hostnaam van je TinyPPI-box in. De standaardpoort is 8099."
        case .token: return "Gebruik het toegangstoken uit TinyPPI → Instellingen → Dashboard → Adres en token tonen."
        case .all: return "Gebruik het adres en token uit TinyPPI → Instellingen → Dashboard → Adres en token tonen. De standaardpoort is 8099."
        }
    }
}

private struct SettingsGroup<Content: View>: View {
    let title: String
    let content: Content

    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary).padding(.leading, 4)
            VStack(spacing: 0) { content }
                .padding(.horizontal, 14)
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
        }
    }
}

private struct SettingsRow: View {
    let icon: String
    let tint: Color
    let title: String
    let value: String
    let action: () -> Void
    var body: some View {
        Button(action: action) { SettingsRowLabel(icon: icon, tint: tint, title: title, value: value) }
            .buttonStyle(.plain)
    }
}

private struct SettingsRowLabel: View {
    let icon: String
    let tint: Color
    let title: String
    var value: String? = nil
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                .frame(width: 30, height: 30).background(tint, in: RoundedRectangle(cornerRadius: 8))
            Text(title).foregroundStyle(.primary)
            Spacer(minLength: 8)
            if let value { Text(value).font(.subheadline).foregroundStyle(.secondary).lineLimit(1) }
            Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.tertiary)
        }
        .frame(minHeight: 52).contentShape(Rectangle())
    }
}

private struct PrivacyNetworkView: View {
    var body: some View {
        List {
            Section("Lokale netwerkverbinding") {
                Label("TinyPPI maakt alleen verbinding met het serveradres dat je zelf instelt.", systemImage: "network")
                Label("Je toegangstoken blijft op dit apparaat opgeslagen.", systemImage: "lock.fill")
            }
            Section {
                Text("Beheer lokale netwerktoegang via Instellingen → Privacy en beveiliging → Lokaal netwerk.")
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Privacy en netwerk").navigationBarTitleDisplayMode(.inline)
    }
}

private struct AdvancedDashboardSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    let baseURL: URL
    let token: String

    var body: some View {
        DashboardWebView(baseURL: baseURL, token: token, selectedTab: "settings")
            .navigationTitle("Boxen en dashboard")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: {
                        Label("Instellingen", systemImage: "chevron.left")
                    }
                }
            }
    }
}

private struct AboutTinyPPIView: View {
    var body: some View {
        List {
            Section {
                LabeledContent("App", value: "TinyPPI iOS")
                LabeledContent("Versie", value: "1.5.3")
                LabeledContent("Ondersteunde backend", value: "TinyPPI 2.22.0")
            }
        }
        .navigationTitle("Over TinyPPI").navigationBarTitleDisplayMode(.inline)
    }
}

private struct TinyPPIButtonStyle: ButtonStyle {
    let filled: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(filled ? Color.white : Color.orange)
            .padding(.horizontal, 16).frame(minHeight: 44)
            .background(filled ? Color.orange : Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 13))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}
