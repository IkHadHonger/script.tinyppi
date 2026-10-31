import Foundation

@MainActor
final class AppModel: ObservableObject {
    @Published var configuration: ServerConfiguration
    @Published var hello: HelloResponse?
    @Published var state: PlayerState?
    @Published var isConnecting = false
    @Published var errorMessage: String?

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
            beginPolling(milliseconds: response.intervalMS)
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

    func disconnect() {
        pollingTask?.cancel()
        hello = nil
        state = nil
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

