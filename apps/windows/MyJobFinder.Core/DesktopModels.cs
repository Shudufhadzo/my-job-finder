using System.Text.Json.Serialization;

namespace MyJobFinder.Core;

public sealed class DesktopProfileInput
{
    public string DisplayName { get; set; } = "";
    public string SourceCvPath { get; set; } = "";
    public List<string> TargetRoles { get; set; } = [];
    public List<string> Locations { get; set; } = [];
    public string ScheduleTime { get; set; } = "10:00";
    public bool ScheduleEnabled { get; set; } = true;
    public string AiModel { get; set; } = "gpt-5.3-codex";
    public string ReasoningEffort { get; set; } = "medium";
}

public sealed class DesktopProfile
{
    public int Version { get; set; }
    public string Id { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string MasterCvPath { get; set; } = "";
    public string MasterCvMarkdownPath { get; set; } = "";
    public List<string> TargetRoles { get; set; } = [];
    public List<string> Locations { get; set; } = [];
    public string ScheduleTime { get; set; } = "10:00";
    public bool ScheduleEnabled { get; set; }
    public string AiModel { get; set; } = "gpt-5.3-codex";
    public string ReasoningEffort { get; set; } = "medium";
    public string CreatedAt { get; set; } = "";
    public string UpdatedAt { get; set; } = "";
}

public sealed class JobItem
{
    public string Id { get; set; } = "";
    public string CandidateProfile { get; set; } = "";
    public string Title { get; set; } = "";
    public string Company { get; set; } = "";
    public string Location { get; set; } = "";
    public string EmploymentType { get; set; } = "";
    public string Url { get; set; } = "";
    public string ApplyUrl { get; set; } = "";
    public string Platform { get; set; } = "";
    public int Score { get; set; }
    public List<string> FieldTags { get; set; } = [];
    public string Status { get; set; } = "";
    public string DiscoveredAt { get; set; } = "";
    public string AppliedAt { get; set; } = "";
    public string LastError { get; set; } = "";
    public string SelectedCvPdf { get; set; } = "";
    public bool CoverLetterRequired { get; set; }
    public string SelectedCoverLetterPdf { get; set; } = "";
    public string Excerpt { get; set; } = "";
    public string ScoreLabel => $"{Score}% match";
    public string FieldLabel => string.Join(" · ", FieldTags.Select(FormatTag));
    public bool HasCv => !string.IsNullOrWhiteSpace(SelectedCvPdf) && File.Exists(SelectedCvPdf);
    public bool HasCoverLetter => !string.IsNullOrWhiteSpace(SelectedCoverLetterPdf) && File.Exists(SelectedCoverLetterPdf);

    private static string FormatTag(string value) => value.Replace('_', ' ').ToUpperInvariant();
}

public sealed class DesktopState
{
    public DesktopProfile? Profile { get; set; }
    public List<JobItem> Jobs { get; set; } = [];
    public string NextRunAt { get; set; } = "";
    public string GeneratedAt { get; set; } = "";
    public List<string> AvailableModels { get; set; } = [];
    public List<string> AvailableReasoningEfforts { get; set; } = [];
}

public sealed class FieldMetric
{
    public string Label { get; set; } = "";
    public int Count { get; set; }
    public double Percentage { get; set; }
    public string IconGlyph { get; set; } = "\uE8D2";
}

public sealed class WorkerEvent
{
    public string Type { get; set; } = "";
    public string Message { get; set; } = "";
    public string Timestamp { get; set; } = "";
    public string JobId { get; set; } = "";
}

public sealed class WorkerEnvelope
{
    public bool Ok { get; set; }
    public DesktopState? State { get; set; }
    public DesktopProfile? Profile { get; set; }
    public WorkerEvent? Event { get; set; }
    public string Error { get; set; } = "";
}
