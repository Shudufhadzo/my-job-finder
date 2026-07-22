import Foundation

enum ScheduleService {
    static let label = "com.myjobfinder.daily"

    static func apply(enabled: Bool, time: String) throws {
        let launchAgents = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/LaunchAgents", isDirectory: true)
        try FileManager.default.createDirectory(at: launchAgents, withIntermediateDirectories: true)
        let plistURL = launchAgents.appendingPathComponent("\(label).plist")
        let launchctl = Process()
        launchctl.executableURL = URL(fileURLWithPath: "/bin/launchctl")

        if !enabled {
            launchctl.arguments = ["unload", plistURL.path]
            try? launchctl.run()
            launchctl.waitUntilExit()
            try? FileManager.default.removeItem(at: plistURL)
            return
        }

        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { throw CocoaError(.formatting) }
        let executable = Bundle.main.executableURL?.path ?? CommandLine.arguments[0]
        let plist: [String: Any] = [
            "Label": label,
            "ProgramArguments": [executable, "--scheduled"],
            "StartCalendarInterval": ["Hour": parts[0], "Minute": parts[1]],
            "RunAtLoad": false,
            "StandardOutPath": FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/MyJobFinder.log").path,
            "StandardErrorPath": FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/MyJobFinder.error.log").path
        ]
        let data = try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
        try data.write(to: plistURL, options: .atomic)
        launchctl.arguments = ["load", "-w", plistURL.path]
        try launchctl.run()
        launchctl.waitUntilExit()
        if launchctl.terminationStatus != 0 { throw CocoaError(.executableRuntimeMismatch) }
    }
}
