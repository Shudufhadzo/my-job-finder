import AppKit
import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        guard CommandLine.arguments.contains("--scheduled") else { return }
        Task {
            try? await WorkerClient().refresh()
            await MainActor.run { NSApplication.shared.terminate(nil) }
        }
    }
}

@main
struct MyJobFinderApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model = AppViewModel()

    var body: some Scene {
        WindowGroup("My Job Finder") { ContentView().environmentObject(model) }
            .windowStyle(.hiddenTitleBar)
            .windowToolbarStyle(.unifiedCompact)
        Settings { SetupView().environmentObject(model) }
    }
}
