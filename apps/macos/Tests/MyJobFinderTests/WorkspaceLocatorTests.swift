import Foundation
import XCTest
@testable import MyJobFinder

final class WorkspaceLocatorTests: XCTestCase {
    func testProfileInputEncodesSelectedCodexModel() throws {
        let input = DesktopProfileInput(
            displayName: "Test User",
            sourceCvPath: "/tmp/cv.pdf",
            targetRoles: ["Data Scientist"],
            locations: ["Remote"],
            scheduleTime: "10:00",
            scheduleEnabled: true,
            aiModel: "gpt-5.6-terra",
            reasoningEffort: "high"
        )
        let json = String(decoding: try JSONEncoder().encode(input), as: UTF8.self)
        XCTAssertTrue(json.contains("\"aiModel\":\"gpt-5.6-terra\""))
        XCTAssertTrue(json.contains("\"reasoningEffort\":\"high\""))
    }

    func testFindsWorkspaceFromNestedAppPath() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let nested = root.appendingPathComponent("apps/macos/build")
        try FileManager.default.createDirectory(at: nested, withIntermediateDirectories: true)
        try Data("{}".utf8).write(to: root.appendingPathComponent("package.json"))
        let worker = root.appendingPathComponent("src/desktop/cli.ts")
        try FileManager.default.createDirectory(at: worker.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data().write(to: worker)
        defer { try? FileManager.default.removeItem(at: root) }
        XCTAssertEqual(try WorkspaceLocator.find(startingAt: nested), root)
    }
}
