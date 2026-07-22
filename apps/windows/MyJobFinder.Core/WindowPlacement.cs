namespace MyJobFinder.Core;

public readonly record struct WindowBounds(int X, int Y, int Width, int Height);

public static class WindowPlacement
{
    private const int SafetyMargin = 24;

    public static WindowBounds Calculate(
        int workAreaX,
        int workAreaY,
        int workAreaWidth,
        int workAreaHeight,
        int desiredWidth,
        int desiredHeight)
    {
        var availableWidth = Math.Max(1, workAreaWidth - (SafetyMargin * 2));
        var availableHeight = Math.Max(1, workAreaHeight - (SafetyMargin * 2));
        var width = Math.Min(desiredWidth, availableWidth);
        var height = Math.Min(desiredHeight, availableHeight);
        var x = workAreaX + ((workAreaWidth - width) / 2);
        var y = workAreaY + ((workAreaHeight - height) / 2);

        return new WindowBounds(x, y, width, height);
    }
}
