using System.Text.Json;

namespace MyJobFinder.Core;

public static class WorkerProtocol
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    public static WorkerEnvelope ParseEnvelope(string line)
    {
        return JsonSerializer.Deserialize<WorkerEnvelope>(line, Options)
            ?? throw new InvalidDataException("The My Job Finder worker returned an empty response.");
    }

    public static string SerializeProfile(DesktopProfileInput profile)
    {
        return JsonSerializer.Serialize(profile, Options);
    }
}
