import Foundation

final class WorkerClient {
    private let workspace: URL
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(workspace: URL? = nil) throws {
        self.workspace = try workspace ?? WorkspaceLocator.find()
    }

    func state() async throws -> WorkerEnvelope {
        try await run(command: "state")
    }

    func configure(_ input: DesktopProfileInput) async throws -> WorkerEnvelope {
        try await run(command: "configure", input: try encoder.encode(input))
    }

    func refresh(onEvent: @escaping @Sendable (WorkerEvent) -> Void = { _ in }) async throws -> WorkerEnvelope {
        try await run(command: "refresh", onEvent: onEvent)
    }

    private func run(command: String, input: Data? = nil, onEvent: @escaping @Sendable (WorkerEvent) -> Void = { _ in }) async throws -> WorkerEnvelope {
        try await Task.detached {
            let worker = self.workspace.appendingPathComponent("dist/desktop/cli.js")
            guard FileManager.default.fileExists(atPath: worker.path) else {
                throw CocoaError(.fileNoSuchFile, userInfo: [NSLocalizedDescriptionKey: "Run npm run desktop:build-worker before opening My Job Finder."])
            }

            let process = Process()
            let bundledNode = self.workspace.appendingPathComponent("node")
            if FileManager.default.fileExists(atPath: bundledNode.path) {
                process.executableURL = bundledNode
                process.arguments = [worker.path, command]
            } else {
                process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
                process.arguments = ["node", worker.path, command]
            }
            process.currentDirectoryURL = self.workspace
            var environment = ProcessInfo.processInfo.environment
            let appData = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/My Job Finder").path
            environment["MY_JOB_FINDER_HOME"] = appData
            environment["MY_JOB_FINDER_ENGINE_HOME"] = appData
            let bundledBrowsers = self.workspace.appendingPathComponent("ms-playwright").path
            if FileManager.default.fileExists(atPath: bundledBrowsers) {
                environment["PLAYWRIGHT_BROWSERS_PATH"] = bundledBrowsers
            }
            process.environment = environment
            let stdout = Pipe()
            let stderr = Pipe()
            let stdin = Pipe()
            process.standardOutput = stdout
            process.standardError = stderr
            process.standardInput = stdin
            try process.run()
            if let input { stdin.fileHandleForWriting.write(input) }
            try? stdin.fileHandleForWriting.close()
            let outputData = stdout.fileHandleForReading.readDataToEndOfFile()
            let errorData = stderr.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()

            var final: WorkerEnvelope?
            let lines = String(decoding: outputData, as: UTF8.self).split(whereSeparator: \.isNewline)
            for line in lines {
                let envelope = try self.decoder.decode(WorkerEnvelope.self, from: Data(line.utf8))
                if let event = envelope.event { onEvent(event) }
                if envelope.state != nil || envelope.error != nil || envelope.profile != nil { final = envelope }
            }
            guard process.terminationStatus == 0, let final, final.ok != false else {
                let stderrText = String(decoding: errorData, as: UTF8.self)
                throw CocoaError(.executableRuntimeMismatch, userInfo: [NSLocalizedDescriptionKey: final?.error ?? stderrText])
            }
            return final
        }.value
    }
}
