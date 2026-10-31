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

