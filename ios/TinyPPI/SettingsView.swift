import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Form {
            Section("TinyPPI-server") {
                TextField("IP-adres of hostnaam", text: $model.configuration.host)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .keyboardType(.URL)
                TextField("Poort", value: $model.configuration.port, format: .number)
                    .keyboardType(.numberPad)
                SecureField("Toegangstoken", text: $model.configuration.token)
                    .textInputAutocapitalization(.characters).autocorrectionDisabled()
            }
            Section {
                Button {
                    Task { await model.connect() }
                } label: {
                    HStack {
                        if model.isConnecting { ProgressView().padding(.trailing, 6) }
                        Label(model.hello == nil ? "Verbinden" : "Opnieuw verbinden", systemImage: "network")
                    }
                }
                .disabled(model.configuration.host.isEmpty || model.isConnecting)
            } footer: {
                Text("Gebruik het adres en token uit TinyPPI → Instellingen → Dashboard → Adres en token tonen. Standaardpoort: 8099.")
            }
            if let hello = model.hello {
                Section("Verbinding") {
                    LabeledContent("Server", value: hello.name)
                    LabeledContent("API-versie", value: hello.version)
                    LabeledContent("Bediening", value: hello.control ? "Toegestaan" : "Alleen lezen")
                    Label("Verbonden", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                }
            }
            Section("Over") {
                LabeledContent("App", value: "TinyPPI iOS 1.3.1")
                LabeledContent("Backend", value: "TinyPPI 2.22.0")
            }
        }
        .navigationTitle("Instellingen")
    }
}

