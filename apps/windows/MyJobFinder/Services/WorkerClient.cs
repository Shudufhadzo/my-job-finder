using System.Diagnostics;
using MyJobFinder.Core;

namespace MyJobFinder.Services;

public sealed class WorkerClient
{
    private readonly string workspaceRoot;
    private readonly string workerPath;
    private readonly string nodePath;
    private readonly string appDataRoot;

    public WorkerClient()
    {
        workspaceRoot = WorkspaceLocator.Find(AppContext.BaseDirectory);
        workerPath = Path.Combine(workspaceRoot, "dist", "desktop", "cli.js");
        nodePath = File.Exists(Path.Combine(workspaceRoot, "node.exe"))
            ? Path.Combine(workspaceRoot, "node.exe")
            : "node.exe";
        appDataRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "My Job Finder");
        if (!File.Exists(workerPath))
        {
            throw new FileNotFoundException("Build the shared worker with npm run desktop:build-worker.", workerPath);
        }
    }

    public Task<WorkerEnvelope> GetStateAsync() => RunAsync("state", null, null);

    public Task<WorkerEnvelope> ConfigureAsync(DesktopProfileInput input)
        => RunAsync("configure", WorkerProtocol.SerializeProfile(input), null);

    public Task<WorkerEnvelope> RefreshAsync(IProgress<WorkerEvent>? progress = null)
        => RunAsync("refresh", null, progress);

    private async Task<WorkerEnvelope> RunAsync(string command, string? input, IProgress<WorkerEvent>? progress)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = nodePath,
            WorkingDirectory = workspaceRoot,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        startInfo.ArgumentList.Add(workerPath);
        startInfo.ArgumentList.Add(command);
        startInfo.Environment["MY_JOB_FINDER_HOME"] = appDataRoot;
        startInfo.Environment["MY_JOB_FINDER_ENGINE_HOME"] = appDataRoot;
        var bundledBrowsers = Path.Combine(workspaceRoot, "ms-playwright");
        if (Directory.Exists(bundledBrowsers))
        {
            startInfo.Environment["PLAYWRIGHT_BROWSERS_PATH"] = bundledBrowsers;
        }

        using var process = new Process { StartInfo = startInfo };
        process.Start();
        if (input is not null) await process.StandardInput.WriteAsync(input);
        process.StandardInput.Close();
        var errorTask = process.StandardError.ReadToEndAsync();
        WorkerEnvelope? final = null;

        while (await process.StandardOutput.ReadLineAsync() is { } line)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var envelope = WorkerProtocol.ParseEnvelope(line);
            if (envelope.Event is not null) progress?.Report(envelope.Event);
            if (envelope.State is not null || !envelope.Ok || envelope.Profile is not null) final = envelope;
        }

        await process.WaitForExitAsync();
        var error = await errorTask;
        if (process.ExitCode != 0 || final is null || !final.Ok)
        {
            throw new InvalidOperationException(final?.Error ?? error.Trim() ?? "The job worker failed.");
        }
        return final;
    }
}
