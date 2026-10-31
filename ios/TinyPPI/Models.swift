import Foundation

struct ServerConfiguration: Codable, Equatable {
    var host = ""
    var port = 8099
    var token = ""

    var baseURL: URL? {
        var value = host.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return nil }
        if !value.contains("://") { value = "http://" + value }
        guard var parts = URLComponents(string: value) else { return nil }
        if parts.port == nil { parts.port = port }
        parts.path = ""
        parts.query = nil
        parts.fragment = nil
        return parts.url
    }
}

struct HelloResponse: Decodable {
    let name: String
    let version: String
    let authRead: Bool
    let control: Bool
    let intervalMS: Int

    enum CodingKeys: String, CodingKey {
        case name, version, control
        case authRead = "auth_read"
        case intervalMS = "interval_ms"
    }
}

struct PlayerState: Decodable, Equatable {
    let sequence: Int
    let playing: Bool
    let paused: Bool
    let title: String
    let filename: String
    let hdrType: String
    let outputType: String
    let time: String
    let duration: String
    let finish: String
    let groups: [InfoGroup]
    let control: Bool

    enum CodingKeys: String, CodingKey {
        case playing, paused, title, filename, time, duration, finish, groups, control
        case sequence = "seq"
        case hdrType = "hdr_type"
        case outputType = "output_type"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sequence = try c.decodeIfPresent(Int.self, forKey: .sequence) ?? 0
        playing = try c.decodeIfPresent(Bool.self, forKey: .playing) ?? false
        paused = try c.decodeIfPresent(Bool.self, forKey: .paused) ?? false
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        filename = try c.decodeIfPresent(String.self, forKey: .filename) ?? ""
        hdrType = try c.decodeIfPresent(String.self, forKey: .hdrType) ?? ""
        outputType = try c.decodeIfPresent(String.self, forKey: .outputType) ?? ""
        time = try c.decodeIfPresent(String.self, forKey: .time) ?? ""
        duration = try c.decodeIfPresent(String.self, forKey: .duration) ?? ""
        finish = try c.decodeIfPresent(String.self, forKey: .finish) ?? ""
        groups = try c.decodeIfPresent([InfoGroup].self, forKey: .groups) ?? []
        control = try c.decodeIfPresent(Bool.self, forKey: .control) ?? false
    }
}

struct InfoGroup: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let rows: [InfoRow]
}

struct InfoRow: Decodable, Identifiable, Equatable {
    let id: String
    let label: String
    let value: String
    let detail: String

    enum CodingKeys: String, CodingKey { case id, label, value, detail }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        label = try c.decodeIfPresent(String.self, forKey: .label) ?? ""
        value = try c.decodeIfPresent(String.self, forKey: .value) ?? ""
        detail = try c.decodeIfPresent(String.self, forKey: .detail) ?? ""
    }
}

