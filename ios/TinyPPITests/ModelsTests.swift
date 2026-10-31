import XCTest
@testable import TinyPPI

final class ModelsTests: XCTestCase {
    func testBareHostBuildsDefaultHTTPURL() {
        let config = ServerConfiguration(host: "192.168.1.20", port: 8099, token: "ABC")
        XCTAssertEqual(config.baseURL?.absoluteString, "http://192.168.1.20:8099")
    }

    func testIdleStateUsesSafeDefaults() throws {
        let state = try JSONDecoder().decode(PlayerState.self, from: Data(#"{"seq":4,"playing":false,"groups":[]}"#.utf8))
        XCTAssertFalse(state.playing)
        XCTAssertEqual(state.sequence, 4)
        XCTAssertEqual(state.title, "")
    }

    func testMovieLibraryDecoding() throws {
        let data = Data(#"{"movies":[{"id":12,"title":"Arrival","year":2016,"poster":"abc123","video":"hdr10"}],"count":1}"#.utf8)
        let library = try JSONDecoder().decode(MovieLibrary.self, from: data)
        XCTAssertEqual(library.count, 1)
        XCTAssertEqual(library.movies.first?.displayTitle, "Arrival")
        XCTAssertEqual(library.movies.first?.subtitle, "2016 · HDR10")
    }
}

