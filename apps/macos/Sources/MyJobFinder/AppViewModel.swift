import AppKit
import Foundation

@MainActor
final class AppViewModel: ObservableObject {
    @Published var profile: DesktopProfile?
    @Published var jobs: [JobItem] = []
    @Published var query = ""
    @Published var status = "Ready"
    @Published var isRunning = false
    @Published var nextRunText = "Daily search is not configured"
    @Published var showingSetup = false
    @Published var errorMessage: String?
    @Published var availableModels: [String] = []
    @Published var availableReasoningEfforts: [String] = []

    private var client: WorkerClient?

    var filteredJobs: [JobItem] {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else { return jobs }
        return jobs.filter { "\($0.title) \($0.company) \($0.location) \($0.fieldLabel) \($0.status)".localizedCaseInsensitiveContains(query) }
    }
    var strongMatches: Int { jobs.filter { $0.score >= 70 }.count }
    var readyDocuments: Int { jobs.filter { $0.hasCV && $0.hasCoverLetter }.count }
    var applied: Int { jobs.filter { $0.status == "applied" }.count }
    var strongMatchRate: Double { percentage(strongMatches) }
    var documentReadyRate: Double { percentage(readyDocuments) }
    var appliedRate: Double { percentage(applied) }
    var topFields: [FieldMetric] {
        let symbols = [
            "engineering": "bolt.fill",
            "data_science": "brain.head.profile",
            "data_analytics": "chart.xyaxis.line",
            "fintech": "creditcard.fill",
            "project_management": "checklist",
            "education_training": "graduationcap.fill"
        ]
        let counts = Dictionary(grouping: jobs.flatMap(\.fieldTags), by: { $0 }).mapValues(\.count)
        return counts.sorted { $0.value > $1.value }.prefix(4).map { key, count in
            FieldMetric(
                id: key,
                label: key.replacingOccurrences(of: "_", with: " ").capitalized,
                count: count,
                ratio: jobs.isEmpty ? 0 : Double(count) / Double(jobs.count),
                symbol: symbols[key] ?? "circle.grid.2x2.fill"
            )
        }
    }

    func load() async {
        do {
            let client = try WorkerClient()
            self.client = client
            apply(try await client.state().state)
            if profile == nil { showingSetup = true }
        } catch {
            errorMessage = error.localizedDescription
            showingSetup = true
        }
    }

    func save(_ input: DesktopProfileInput) async {
        isRunning = true
        status = "Saving profile and schedule"
        defer { isRunning = false }
        do {
            let client = try self.client ?? WorkerClient()
            self.client = client
            let response = try await client.configure(input)
            try ScheduleService.apply(enabled: input.scheduleEnabled, time: input.scheduleTime)
            apply(response.state)
            status = "Preferences and daily schedule saved"
            showingSetup = false
        } catch { errorMessage = error.localizedDescription }
    }

    func refresh() async {
        guard let client else { return }
        isRunning = true
        status = "Starting daily search"
        defer { isRunning = false }
        do {
            let response = try await client.refresh { event in
                Task { @MainActor in self.status = event.message }
            }
            apply(response.state)
            status = "Daily search completed"
        } catch {
            errorMessage = error.localizedDescription
            status = "Daily search failed"
        }
    }

    func open(_ path: String) { NSWorkspace.shared.open(URL(fileURLWithPath: path)) }
    func reveal(_ path: String) { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)]) }
    func openJob(_ value: String) { if let url = URL(string: value) { NSWorkspace.shared.open(url) } }

    private func apply(_ state: DesktopState?) {
        guard let state else { return }
        profile = state.profile
        jobs = state.jobs.sorted { $0.score > $1.score }
        availableModels = state.availableModels
        availableReasoningEfforts = state.availableReasoningEfforts
        if let date = ISO8601DateFormatter().date(from: state.nextRunAt) {
            nextRunText = "Next search " + date.formatted(date: .abbreviated, time: .shortened)
        } else { nextRunText = "Daily search is paused" }
    }

    private func percentage(_ count: Int) -> Double {
        jobs.isEmpty ? 0 : Double(count) / Double(jobs.count)
    }
}
