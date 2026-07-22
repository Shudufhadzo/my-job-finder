using Microsoft.UI.Xaml;
using MyJobFinder.Services;

namespace MyJobFinder;

public partial class App : Application
{
    private Window? window;

    public App()
    {
        InitializeComponent();
    }

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        if (Environment.GetCommandLineArgs().Any(value => value.Equals("--scheduled", StringComparison.OrdinalIgnoreCase)))
        {
            try
            {
                await new WorkerClient().RefreshAsync();
            }
            finally
            {
                Exit();
            }
            return;
        }

        window = new MainWindow();
        window.Activate();
    }
}
