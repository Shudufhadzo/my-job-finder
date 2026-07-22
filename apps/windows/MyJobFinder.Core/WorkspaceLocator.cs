namespace MyJobFinder.Core;

public static class WorkspaceLocator
{
    public static string Find(string startPath)
    {
        var configured = Environment.GetEnvironmentVariable("MY_JOB_FINDER_WORKSPACE");
        if (!string.IsNullOrWhiteSpace(configured) && IsWorkspace(configured))
        {
            return Path.GetFullPath(configured);
        }

        var start = Path.GetFullPath(startPath);
        var bundledEngine = Path.Combine(start, "engine");
        if (IsWorkspace(bundledEngine)) return bundledEngine;

        var directory = new DirectoryInfo(start);
        while (directory is not null)
        {
            if (IsWorkspace(directory.FullName)) return directory.FullName;
            directory = directory.Parent;
        }

        throw new DirectoryNotFoundException(
            "The shared My Job Finder worker could not be located. Set MY_JOB_FINDER_WORKSPACE to the application workspace.");
    }

    private static bool IsWorkspace(string path)
    {
        return File.Exists(Path.Combine(path, "package.json"))
            && (File.Exists(Path.Combine(path, "src", "desktop", "cli.ts"))
                || File.Exists(Path.Combine(path, "dist", "desktop", "cli.js")));
    }
}
