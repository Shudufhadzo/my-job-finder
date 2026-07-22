using System.Text.Json;
using MyJobFinder.Core;

var failures = new List<string>();

void Check(bool condition, string message)
{
    if (!condition) failures.Add(message);
}

var root = Path.Combine(Path.GetTempPath(), $"my-job-finder-core-{Guid.NewGuid():N}");
var nested = Path.Combine(root, "apps", "windows", "bin");
Directory.CreateDirectory(nested);
File.WriteAllText(Path.Combine(root, "package.json"), "{}");
Directory.CreateDirectory(Path.Combine(root, "src", "desktop"));
File.WriteAllText(Path.Combine(root, "src", "desktop", "cli.ts"), "");

Check(WorkspaceLocator.Find(nested) == root, "Workspace locator should find the shared worker root.");

var packagedRoot = Path.Combine(root, "packaged");
var packagedEngine = Path.Combine(packagedRoot, "engine");
Directory.CreateDirectory(Path.Combine(packagedEngine, "dist", "desktop"));
File.WriteAllText(Path.Combine(packagedEngine, "package.json"), "{}");
File.WriteAllText(Path.Combine(packagedEngine, "dist", "desktop", "cli.js"), "");
Check(WorkspaceLocator.Find(packagedRoot) == packagedEngine, "Workspace locator should prefer a bundled engine.");

var line = "{\"ok\":true,\"state\":{\"generatedAt\":\"2026-07-21T10:00:00Z\",\"nextRunAt\":\"\",\"profile\":null,\"jobs\":[]}}";
var envelope = WorkerProtocol.ParseEnvelope(line);
Check(envelope.Ok, "Worker envelope should parse success.");
Check(envelope.State?.Jobs.Count == 0, "Worker state should parse jobs.");
var profileJson = WorkerProtocol.SerializeProfile(new DesktopProfileInput
{
    DisplayName = "Jane Doe",
    SourceCvPath = "C:\\CV.pdf",
    TargetRoles = ["Data Scientist"],
    Locations = ["Remote"],
    AiModel = "gpt-5.6-terra",
    ReasoningEffort = "high"
});
Check(profileJson.Contains("gpt-5.6-terra", StringComparison.Ordinal), "Selected AI model should be sent to the worker.");
Check(profileJson.Contains("high", StringComparison.Ordinal), "Reasoning effort should be sent to the worker.");

var schedule = SchedulerCommand.BuildWindowsCreate("C:\\Apps\\My Job Finder\\MyJobFinder.exe", "10:00");
Check(schedule.FileName == "schtasks.exe", "Windows scheduler should use schtasks.");
Check(schedule.Arguments.Contains("My Job Finder Daily", StringComparison.Ordinal), "Task should use a stable name.");
Check(schedule.Arguments.Contains("10:00", StringComparison.Ordinal), "Task should retain the configured time.");

var standardPlacement = WindowPlacement.Calculate(0, 0, 1536, 816, 1180, 760);
Check(standardPlacement == new WindowBounds(178, 28, 1180, 760), "Window should be centered inside the desktop work area.");

var compactPlacement = WindowPlacement.Calculate(1920, 40, 900, 650, 1180, 760);
Check(compactPlacement == new WindowBounds(1944, 64, 852, 602), "Window should shrink inside a smaller work area with a safety margin.");

Directory.Delete(root, true);
if (failures.Count > 0)
{
    Console.Error.WriteLine(string.Join(Environment.NewLine, failures));
    return 1;
}

Console.WriteLine("MyJobFinder.Core smoke tests passed.");
return 0;
