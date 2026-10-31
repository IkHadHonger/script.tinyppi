import SwiftUI
import UIKit

struct LibraryView: View {
    @EnvironmentObject private var model: AppModel
    @State private var section = LibrarySection.continueWatching

    var body: some View {
        Group {
            if model.hello == nil {
                ContentUnavailableView("Nog niet verbonden", systemImage: "network.slash", description: Text("Verbind eerst met TinyPPI bij Instellingen."))
            } else if model.isLoadingLibrary && items.isEmpty {
                ProgressView("Bibliotheek laden…")
            } else if items.isEmpty {
                ContentUnavailableView("Geen titels", systemImage: "rectangle.stack", description: Text("Controleer of de film- en seriebibliotheek in TinyPPI is ingeschakeld."))
            } else {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 155), spacing: 14)], spacing: 18) {
                        ForEach(items) { item in
                            NavigationLink(value: item) { LibraryCard(item: item) }
                                .buttonStyle(.plain)
                        }
                    }
                    .padding()
                }
            }
        }
        .navigationTitle("Bibliotheek")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Onderdeel", selection: $section) {
                        ForEach(LibrarySection.allCases) { value in Text(value.title).tag(value) }
                    }
                } label: { Label(section.title, systemImage: "line.3.horizontal.decrease.circle") }
            }
        }
        .navigationDestination(for: LibraryItem.self) { item in LibraryDetailView(item: item) }
        .task { if model.movies.isEmpty && model.shows.isEmpty { await model.loadLibrary() } }
        .refreshable { await model.loadLibrary() }
    }

    private var items: [LibraryItem] {
        switch section {
        case .continueWatching: return model.continueItems
        case .next: return model.nextEpisodes
        case .movies: return model.movies
        case .series: return model.shows
        }
    }
}

private enum LibrarySection: String, CaseIterable, Identifiable {
    case continueWatching, next, movies, series
    var id: String { rawValue }
    var title: String {
        switch self {
        case .continueWatching: return "Verder kijken"
        case .next: return "Volgende afleveringen"
        case .movies: return "Films"
        case .series: return "Series"
        }
    }
}

private struct LibraryCard: View {
    @EnvironmentObject private var model: AppModel
    let item: LibraryItem

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            AuthenticatedArtwork(item: item)
                .aspectRatio(2 / 3, contentMode: .fill)
                .frame(maxWidth: .infinity)
                .clipped()
                .background(.quaternary)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            Text(item.displayTitle).font(.subheadline.bold()).lineLimit(2)
            Text(item.subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
    }
}

private struct LibraryDetailView: View {
    @EnvironmentObject private var model: AppModel
    let item: LibraryItem

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                AuthenticatedArtwork(item: item)
                    .aspectRatio(2 / 3, contentMode: .fit)
                    .frame(maxHeight: 380)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                Text(item.displayTitle).font(.title2.bold()).multilineTextAlignment(.center)
                if !item.subtitle.isEmpty { Text(item.subtitle).foregroundStyle(.secondary) }
                HStack(spacing: 8) {
                    if let rating = item.rating { Label(rating.formatted(.number.precision(.fractionLength(1))), systemImage: "star.fill") }
                    if let audio = item.audio { Text(audio.uppercased()) }
                    if let genres = item.genres { Text(genres.prefix(2).joined(separator: " · ")) }
                }
                .font(.caption).foregroundStyle(.secondary)
                Button {
                    Task { await model.play(item) }
                } label: {
                    Label((item.resume ?? 0) > 0 ? "Verder afspelen" : "Afspelen", systemImage: "play.fill")
                        .frame(maxWidth: .infinity).padding(.vertical, 10)
                }
                .buttonStyle(.borderedProminent).tint(.orange)
                if (item.resume ?? 0) > 0 {
                    Button("Vanaf het begin") { Task { await model.play(item, restart: true) } }
                }
            }
            .padding()
        }
        .navigationTitle(item.kind == "episode" ? "Aflevering" : "Details")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct AuthenticatedArtwork: View {
    @EnvironmentObject private var model: AppModel
    let item: LibraryItem
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            if let image { Image(uiImage: image).resizable().scaledToFill() }
            else { Image(systemName: "film.stack").font(.largeTitle).foregroundStyle(.secondary) }
        }
        .task(id: item.id) {
            guard item.poster != nil || item.thumb != nil else { return }
            if let data = try? await TinyPPIClient(configuration: model.configuration).artworkData(for: item) {
                image = UIImage(data: data)
            }
        }
    }
}
