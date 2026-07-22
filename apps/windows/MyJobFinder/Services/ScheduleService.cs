using System.Diagnostics;
using MyJobFinder.Core;

namespace MyJobFinder.Services;

public sealed class ScheduleService
{
    public async Task ApplyAsync(bool enabled, string time)
    {
        var command = enabled
            ? SchedulerCommand.BuildWindowsCreate(Environment.ProcessPath ?? throw new InvalidOperationException("Application path is unavailable."), time)
            : SchedulerCommand.BuildWindowsDelete();
        using var process = Process.Start(new ProcessStartInfo
        {
            FileName = command.FileName,
            Arguments = command.Arguments,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardError = true,
            RedirectStandardOutput = true
        }) ?? throw new InvalidOperationException("Task Scheduler could not be started.");
        var error = await process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        if (process.ExitCode != 0)
            throw new InvalidOperationException($"Daily schedule could not be updated. {error.Trim()}");
    }
}
