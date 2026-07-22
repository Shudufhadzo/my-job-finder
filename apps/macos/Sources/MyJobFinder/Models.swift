import Foundation

struct DesktopProfileInput: Codable {
    var displayName: String
    var sourceCvPath: String
    var targetRoles: [String]
    var locations: [String]
    var scheduleTime: String
    var scheduleEnabled: Bool
    var aiModel: String
    var reasoningEffort: String
}

struct DesktopProfile: Codable {
    var version: Int
    var id: String
    var displayName: String
    var masterCvPath: String
    var masterCvMarkdownPath: String
    var targetRoles: [String]
    var locations: [String]
    var scheduleTime: String
    var scheduleEnabled: Bool
    var aiModel: String
    var reasoningEffort: String
    var createdAt: String
    var updatedAt: String
}

struct JobItem: Codable, Identifiable {
    var id: String
    var candidateProfile: String
    var title: String
    var company: String
    var location: String
    var employmentType: String?
    var url: String
    var applyUrl: String?
    var platform: String?
    var score: Int
    var fieldTags: [String]
    var status: String
    var discoveredAt: String?
    var appliedAt: String?
    var lastError: String?
    var selectedCvPdf: String
    var coverLetterRequired: Bool
    var selectedCoverLetterPdf: String
    var excerpt: String?

    var scoreLabel: String { "\(score)% match" }
    var fieldLabel: String { fieldTags.map { $0.replacingOccurrences(of: "_", with: " ").uppercased() }.joined(separator: " · ") }
    var hasCV: Bool { FileManager.default.fileExists(atPath: selectedCvPdf) }
    var hasCoverLetter: Bool { FileManager.default.fileExists(atPath: selectedCoverLetterPdf) }
}

struct DesktopState: Codable {
    var profile: DesktopProfile?
    var jobs: [JobItem]
    var nextRunAt: String
    var generatedAt: String
    var availableModels: [String]
    var availableReasoningEfforts: [String]
}

struct FieldMetric: Identifiable {
    let id: String
    let label: String
    let count: Int
    let ratio: Double
    let symbol: String
}

struct WorkerEvent: Codable {
    var type: String
    var message: String
    var timestamp: String?
    var jobId: String?
}

struct WorkerEnvelope: Codable {
    var ok: Bool?
    var state: DesktopState?
    var profile: DesktopProfile?
    var event: WorkerEvent?
    var error: String?
}
