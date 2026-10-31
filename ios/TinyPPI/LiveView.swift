import SwiftUI

struct LiveView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            if let state = model.state, state.playing {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(state.title.isEmpty ? "Wordt afgespeeld" : state.title)
                            .font(.title2.bold())
                        HStack {
                            FormatBadge(state.hdrType)
                            if !state.outputType.isEmpty { FormatBadge("Uit: \(state.outputType)") }
                            Spacer()
                            if !state.finish.isEmpty { Label(state.finish, systemImage: "flag.checkered") }
                        }
                        .font(.caption)
                    }
                    ForEach(state.groups) { group in
                        VStack(alignment: .leading, spacing: 10) {
                            Text(group.title).font(.headline).foregroundStyle(.orange)
                            ForEach(group.rows) { row in
                                HStack(alignment: .firstTextBaseline) {
                                    Text(row.label).foregroundStyle(.secondary)
                                    Spacer()
                                    VStack(alignment: .trailing) {
                                        Text(row.value).fontWeight(.medium)
                                        if !row.detail.isEmpty { Text(row.detail).font(.caption).foregroundStyle(.secondary) }
                                    }
                                }
                            }
                        }
                        .padding()
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                    }
                }
                .padding()
            } else {
                ContentUnavailableView(
                    model.hello == nil ? "Nog niet verbonden" : "Niets wordt afgespeeld",
                    systemImage: model.hello == nil ? "network.slash" : "tv",
                    description: Text(model.hello == nil ? "Voeg je TinyPPI-server toe bij Instellingen." : "Live-informatie verschijnt zodra Kodi afspeelt.")
                )
                .padding(.top, 80)
            }
        }
        .navigationTitle("TinyPPI Live")
        .refreshable { await model.refresh() }
    }
}

private struct FormatBadge: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        if !text.isEmpty {
            Text(text.uppercased()).padding(.horizontal, 8).padding(.vertical, 4)
                .background(.orange.opacity(0.18), in: Capsule()).foregroundStyle(.orange)
        }
    }
}

