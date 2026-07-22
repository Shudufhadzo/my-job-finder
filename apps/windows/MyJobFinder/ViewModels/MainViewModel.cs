using System.Collections.ObjectModel;
using MyJobFinder.Core;
using MyJobFinder.Services;

namespace MyJobFinder.ViewModels;

public sealed class MainViewModel
{
    private readonly WorkerClient worker = new();
    private readonly ScheduleService scheduler = new();
    private List<JobItem> allJobs = [];

    public ObservableCollection<JobItem> Jobs { get; } = [];
    public ObservableCollection<string> ModelOptions { get; } = [];
    public ObservableCollection<string> ReasoningOptions { get; } = [];
    public ObservableCollection<FieldMetric> TopFields { get; } = [];
    public DesktopProfile? Profile { get; private set; }
    public string NextRunText { get; private set; } = "Daily search is not configured";
    public string StatusText { get; private set; } = "Ready";
    public int TotalJobs => allJobs.Count;
    public int StrongMatches => allJobs.Count(job => job.Score >= 70);
    public int ReadyDocuments => allJobs.Count(job => job.HasCv && job.HasCoverLetter);
    public int AppliedJobs => allJobs.Count(job => job.Status == "applied");
    public double StrongMatchRate => Percentage(StrongMatches);
    public double DocumentReadyRate => Percentage(ReadyDocuments);
    public double AppliedRate => Percentage(AppliedJobs);

    public async Task LoadAsync()
    {
        ApplyState((await worker.GetStateAsync()).State ?? new DesktopState());
    }

    public async Task SaveProfileAsync(DesktopProfileInput input)
    {
        StatusText = "Saving preferences";
        var response = await worker.ConfigureAsync(input);
        await scheduler.ApplyAsync(input.ScheduleEnabled, input.ScheduleTime);
        ApplyState(response.State ?? new DesktopState());
        StatusText = "Preferences and daily schedule saved";
    }

    public async Task RefreshAsync(IProgress<WorkerEvent> progress)
    {
        StatusText = "Running daily search";
        var response = await worker.RefreshAsync(progress);
        ApplyState(response.State ?? new DesktopState());
        StatusText = "Daily search completed";
    }

    public void Filter(string query)
    {
        var normalized = query.Trim();
        var filtered = string.IsNullOrWhiteSpace(normalized)
            ? allJobs
            : allJobs.Where(job => $"{job.Title} {job.Company} {job.Location} {job.FieldLabel} {job.Status}"
                .Contains(normalized, StringComparison.OrdinalIgnoreCase));
        Jobs.Clear();
        foreach (var job in filtered) Jobs.Add(job);
    }

    private void ApplyState(DesktopState state)
    {
        Profile = state.Profile;
        allJobs = state.Jobs.OrderByDescending(job => job.Score).ToList();
        ModelOptions.Clear();
        foreach (var model in state.AvailableModels) ModelOptions.Add(model);
        if (Profile is not null && !ModelOptions.Contains(Profile.AiModel)) ModelOptions.Insert(0, Profile.AiModel);
        ReasoningOptions.Clear();
        foreach (var effort in state.AvailableReasoningEfforts) ReasoningOptions.Add(effort);
        BuildFieldMetrics();
        Filter("");
        NextRunText = DateTimeOffset.TryParse(state.NextRunAt, out var next)
            ? $"Next search {next.ToLocalTime():ddd, d MMM · HH:mm}"
            : "Daily search is paused";
    }

    private double Percentage(int count) => TotalJobs == 0 ? 0 : Math.Round(count * 100d / TotalJobs, 1);

    private void BuildFieldMetrics()
    {
        TopFields.Clear();
        var icons = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["engineering"] = "\uE99A",
            ["data_science"] = "\uE950",
            ["data_analytics"] = "\uE9D2",
            ["fintech"] = "\uE8C7",
            ["project_management"] = "\uE821",
            ["education_training"] = "\uE82D"
        };
        var fields = allJobs
            .SelectMany(job => job.FieldTags)
            .GroupBy(value => value)
            .Select(group => new { Field = group.Key, Count = group.Count() })
            .OrderByDescending(item => item.Count)
            .Take(4);
        foreach (var field in fields)
        {
            TopFields.Add(new FieldMetric
            {
                Label = field.Field.Replace('_', ' '),
                Count = field.Count,
                Percentage = TotalJobs == 0 ? 0 : Math.Round(field.Count * 100d / TotalJobs, 1),
                IconGlyph = icons.GetValueOrDefault(field.Field, "\uE8D2")
            });
        }
    }
}
