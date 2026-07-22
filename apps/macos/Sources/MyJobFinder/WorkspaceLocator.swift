import Foundation

enum WorkspaceLocator {
    static func find(startingAt startURL: URL = Bundle.main.bundleURL) throws -> URL {
        if let configured = ProcessInfo.processInfo.environment["MY_JOB_FINDER_WORKSPACE"] {
            let url = URL(fileURLWithPath: configured, isDirectory: true)
            if isWorkspace(url) { return url }
        }

        let bundled = startURL.appendingPathComponent("Contents/Resources/engine", isDirectory: true)
        if isWorkspace(bundled) { return bundled }
        let directBundle = startURL.appendingPathComponent("engine", isDirectory: true)
        if isWorkspace(directBundle) { return directBundle }

        var candidate = startURL.hasDirectoryPath ? startURL : startURL.deletingLastPathComponent()
        while candidate.path != "/" {
            if isWorkspace(candidate) { return candidate }
            candidate.deleteLastPathComponent()
        }
        throw CocoaError(.fileNoSuchFile, userInfo: [NSLocalizedDescriptionKey: "Set MY_JOB_FINDER_WORKSPACE to the folder containing the shared My Job Finder worker."])
    }

    private static func isWorkspace(_ url: URL) -> Bool {
        let package = url.appendingPathComponent("package.json").path
        let sourceWorker = url.appendingPathComponent("src/desktop/cli.ts").path
        let builtWorker = url.appendingPathComponent("dist/desktop/cli.js").path
        return FileManager.default.fileExists(atPath: package)
            && (FileManager.default.fileExists(atPath: sourceWorker) || FileManager.default.fileExists(atPath: builtWorker))
    }
}
