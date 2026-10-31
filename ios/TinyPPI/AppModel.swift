import Foundation

@MainActor
final class AppModel: ObservableObject {
    @Published var configuration: ServerConfiguration
    @Published var hello: HelloResponse?
    @Published var state: PlayerState?
    @Published var isConnecting = false
    @Published var errorMessage: String?
    @Published var movies: [LibraryItem] = []
    @Published var shows: [LibraryItem] = []
    @Published var continueItems: [LibraryItem] = []
    @Published var nextEpisodes: [LibraryItem] = []
    @Published var isLoadingLibrary = false

    private var pollingTask: Task<Void, Never>?
    private let defaults = UserDefaults.standard

    init() {
        if let data = defaults.data(forKey: "server.configuration"),
           let saved = try? JSONDecoder().decode(ServerConfiguration.self, from: data) {
            configuration = saved
        } else {
            configuration = ServerConfiguration()
        }
    }

    func start() async {
        guard configuration.baseURL != nil else { return }
        await connect()
    }

    func connect() async {
        pollingTask?.cancel()
        isConnecting = true
        errorMessage = nil
        do {
            let client = TinyPPIClient(configuration: configuration)
            let response = try await client.hello()
            hello = response
            save()
            isConnecting = false
            await refresh()
        } catch {
            isConnecting = false
            errorMessage = error.localizedDescription
        }
    }

    func refresh() async {
        do {
            state = try await TinyPPIClient(configuration: configuration).state()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func send(_ action: String, value: Double? = nil) async {
        do {
            try await TinyPPIClient(configuration: configuration).command(action, value: value)
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadLibrary() async {
        guard configuration.baseURL != nil else { return }
        isLoadingLibrary = true
        let client = TinyPPIClient(configuration: configuration)
        async let movieResponse = try? client.movies()
        async let seriesResponse = try? client.series()
        async let continueResponse = try? client.continueWatching()
        let (movieResult, seriesResult, continueResult) = await (movieResponse, seriesResponse, continueResponse)
        movies = movieResult?.movies ?? []
        shows = (seriesResult?.shows ?? []).map { item in
                var show = item
                show.kind = "tvshow"
                return show
        }
        continueItems = continueResult?.items ?? []
        nextEpisodes = continueResult?.next ?? []
        if movieResult == nil && seriesResult == nil && continueResult == nil {
            errorMessage = "De bibliotheek is niet beschikbaar. Schakel Film- of Seriebibliotheek en dashboardbediening in bij TinyPPI."
        } else {
            errorMessage = nil
        }
        isLoadingLibrary = false
    }

    func play(_ item: LibraryItem, restart: Bool = false) async {
        do {
            try await TinyPPIClient(configuration: configuration).play(item, restart: restart)
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func disconnect() {
        pollingTask?.cancel()
        hello = nil
        state = nil
    }

    func updateConfiguration(_ configuration: ServerConfiguration) {
        self.configuration = configuration
        save()
    }

    func removeConfiguration() {
        disconnect()
        configuration = ServerConfiguration()
        save()
    }

    private func beginPolling(milliseconds: Int) {
        let delay = UInt64(max(milliseconds, 750)) * 1_000_000
        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: delay)
                guard !Task.isCancelled else { break }
                await self?.refresh()
            }
        }
    }

    private func save() {
        if let data = try? JSONEncoder().encode(configuration) {
            defaults.set(data, forKey: "server.configuration")
        }
    }
}

