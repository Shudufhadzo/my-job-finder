namespace MyJobFinder.Core;

public sealed record SchedulerProcess(string FileName, string Arguments);

public static class SchedulerCommand
{
    public const string WindowsTaskName = "My Job Finder Daily";

    public static SchedulerProcess BuildWindowsCreate(string executablePath, string time)
    {
        if (!TimeOnly.TryParseExact(time, "HH:mm", out _))
            throw new ArgumentException("Time must use HH:mm format.", nameof(time));

        var taskCommand = $"\\\"{executablePath}\\\" --scheduled";
        return new SchedulerProcess(
            "schtasks.exe",
            $"/Create /TN \"{WindowsTaskName}\" /TR \"{taskCommand}\" /SC DAILY /ST {time} /F");
    }

    public static SchedulerProcess BuildWindowsDelete()
    {
        return new SchedulerProcess("schtasks.exe", $"/Delete /TN \"{WindowsTaskName}\" /F");
    }
}
