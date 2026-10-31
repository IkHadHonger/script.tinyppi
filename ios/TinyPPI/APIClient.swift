import Foundation

enum APIError: LocalizedError {
    case invalidServer
    case server(Int, String)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .invalidServer: return "Vul een geldig serveradres in."
        case let .server(code, message): return "Serverfout \(code): \(message)"
        case .invalidResponse: return "De server gaf geen geldig antwoord."
        }
    }
}

struct TinyPPIClient {
    let configuration: ServerConfiguration
    var session: URLSession = .shared

    func hello() async throws -> HelloResponse {
        try await request(path: "/api/hello")
    }

    func state() async throws -> PlayerState {
        try await request(path: "/api/state")
    }

    func command(_ action: String, value: Double? = nil) async throws {
        var body: [String: Any] = ["action": action]
        if let value { body["value"] = value }
        let data = try JSONSerialization.data(withJSONObject: body)
        let _: OKResponse = try await request(path: "/api/command", method: "POST", body: data)
    }

    func movies() async throws -> MovieLibrary {
        try await request(path: "/api/library")
    }

    func series() async throws -> SeriesLibrary {
        try await request(path: "/api/series")
    }

    func continueWatching() async throws -> ContinueLibrary {
        try await request(path: "/api/continue")
    }

    func play(_ item: LibraryItem, restart: Bool = false) async throws {
        var body: [String: Any] = ["resume": !restart]
        if item.kind == "episode" || item.season != nil {
            body["episodeid"] = item.id
        } else {
            body["movieid"] = item.id
        }
        let data = try JSONSerialization.data(withJSONObject: body)
        let _: OKResponse = try await request(path: "/api/play", method: "POST", body: data)
    }

    func artwork(for item: LibraryItem) -> URL? {
        guard let base = configuration.baseURL else { return nil }
        var components = URLComponents(url: base, resolvingAgainstBaseURL: false)
        components?.path = "/api/art"
        let imageKind = item.thumb == nil ? "poster" : "thumb"
        var query = [URLQueryItem(name: "kind", value: imageKind)]
        if item.kind == "episode" || item.season != nil {
            query.append(URLQueryItem(name: "episodeid", value: String(item.id)))
        } else if item.kind == "tvshow" {
            query.append(URLQueryItem(name: "tvshowid", value: String(item.id)))
        } else {
            query.append(URLQueryItem(name: "movieid", value: String(item.id)))
        }
        if let tag = item.thumb ?? item.poster { query.append(URLQueryItem(name: "v", value: tag)) }
        components?.queryItems = query
        return components?.url
    }

    func artworkData(for item: LibraryItem) async throws -> Data {
        guard let url = artwork(for: item) else { throw APIError.invalidServer }
        var request = URLRequest(url: url)
        if !configuration.token.isEmpty {
            request.setValue(configuration.token, forHTTPHeaderField: "X-TinyPPI-Token")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.invalidResponse
        }
        return data
    }

    private func request<T: Decodable>(path: String, method: String = "GET", body: Data? = nil) async throws -> T {
        guard let baseURL = configuration.baseURL,
              let url = URL(string: path, relativeTo: baseURL) else { throw APIError.invalidServer }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 10
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if !configuration.token.isEmpty {
            request.setValue(configuration.token, forHTTPHeaderField: "X-TinyPPI-Token")
        }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(ErrorResponse.self, from: data).error) ?? "onbekende fout"
            throw APIError.server(http.statusCode, message)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

private struct OKResponse: Decodable { let ok: Bool }
private struct ErrorResponse: Decodable { let error: String }

