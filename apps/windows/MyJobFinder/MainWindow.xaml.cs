using System.Diagnostics;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using MyJobFinder.Core;
using MyJobFinder.ViewModels;
using Windows.Graphics;
using Windows.Storage.Pickers;
using WinRT.Interop;

namespace MyJobFinder;

public sealed partial class MainWindow : Window
{
    private bool initialLoadStarted;
    public MainViewModel ViewModel { get; } = new();

    public MainWindow()
    {
        InitializeComponent();
        TitleStatusText.Visibility = Visibility.Collapsed;
        Title = "My Job Finder";
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(TitleBar);
        SystemBackdrop = new MicaBackdrop();
        var windowId = Win32Interop.GetWindowIdFromWindow(WindowNative.GetWindowHandle(this));
        var appWindow = AppWindow.GetFromWindowId(windowId);
        var displayArea = DisplayArea.GetFromWindowId(windowId, DisplayAreaFallback.Primary);
        var workArea = displayArea.WorkArea;
        var placement = WindowPlacement.Calculate(
            workArea.X,
            workArea.Y,
            workArea.Width,
            workArea.Height,
            1180,
            760);
        appWindow.MoveAndResize(new RectInt32(
            placement.X,
            placement.Y,
            placement.Width,
            placement.Height));
        Activated += OnInitialActivated;
        ApplyResponsiveLayout(placement.Width);
    }

    private async void OnInitialActivated(object sender, WindowActivatedEventArgs args)
    {
        if (initialLoadStarted) return;
        initialLoadStarted = true;
        await LoadAsync();
    }

    private async Task LoadAsync()
    {
        try
        {
            await ViewModel.LoadAsync();
            PopulateProfile();
            RefreshVisualState();
        }
        catch (Exception error)
        {
            RunStatusText.Text = error.Message;
            SetupExpander.IsExpanded = true;
        }
    }

    private void PopulateProfile()
    {
        var profile = ViewModel.Profile;
        if (profile is null)
        {
            SetupExpander.IsExpanded = true;
            if (ViewModel.ModelOptions.Count > 0) ModelComboBox.SelectedIndex = 0;
            ReasoningComboBox.SelectedItem = ViewModel.ReasoningOptions.Contains("medium")
                ? "medium"
                : ViewModel.ReasoningOptions.FirstOrDefault();
            return;
        }

        SetupExpander.IsExpanded = false;
        NameBox.Text = profile.DisplayName;
        CvPathBox.Text = profile.MasterCvPath;
        RolesBox.Text = string.Join(", ", profile.TargetRoles);
        LocationsBox.Text = string.Join(", ", profile.Locations);
        ScheduleToggle.IsOn = profile.ScheduleEnabled;
        ModelComboBox.Text = profile.AiModel;
        ReasoningComboBox.SelectedItem = profile.ReasoningEffort;
        if (TimeSpan.TryParse(profile.ScheduleTime, out var time)) SchedulePicker.Time = time;
        ProfileGreetingText.Text = $"{profile.DisplayName.Split(' ')[0]}'s search, organised every morning.";
    }

    private void RefreshVisualState()
    {
        TotalText.Text = ViewModel.TotalJobs.ToString("N0");
        StrongText.Text = ViewModel.StrongMatches.ToString("N0");
        DocumentsText.Text = ViewModel.ReadyDocuments.ToString("N0");
        AppliedText.Text = ViewModel.AppliedJobs.ToString("N0");
        StrongProgress.Value = ViewModel.StrongMatchRate;
        DocumentProgress.Value = ViewModel.DocumentReadyRate;
        AppliedProgress.Value = ViewModel.AppliedRate;
        StrongRateText.Text = $"{ViewModel.StrongMatchRate:0.#}%";
        DocumentRateText.Text = $"{ViewModel.DocumentReadyRate:0.#}%";
        AppliedRateText.Text = $"{ViewModel.AppliedRate:0.#}%";
        NoFieldsText.Visibility = ViewModel.TopFields.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        SidebarScheduleText.Text = ViewModel.NextRunText;
        RunStatusText.Text = ViewModel.StatusText;
        Bindings.Update();
    }

    private async void ChooseCv_Click(object sender, RoutedEventArgs e)
    {
        var picker = new FileOpenPicker();
        InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(this));
        picker.FileTypeFilter.Add(".pdf");
        picker.FileTypeFilter.Add(".docx");
        picker.FileTypeFilter.Add(".txt");
        var file = await picker.PickSingleFileAsync();
        if (file is not null) CvPathBox.Text = file.Path;
    }

    private async void SaveProfile_Click(object sender, RoutedEventArgs e)
    {
        SetupErrorText.Text = "";
        SetBusy(true, "Saving profile and registering the daily task");
        try
        {
            var input = new DesktopProfileInput
            {
                DisplayName = NameBox.Text,
                SourceCvPath = CvPathBox.Text,
                TargetRoles = SplitPreferences(RolesBox.Text),
                Locations = SplitPreferences(LocationsBox.Text),
                ScheduleTime = SchedulePicker.Time.ToString(@"hh\:mm"),
                ScheduleEnabled = ScheduleToggle.IsOn,
                AiModel = ModelComboBox.Text.Trim(),
                ReasoningEffort = ReasoningComboBox.SelectedItem?.ToString() ?? "medium"
            };
            await ViewModel.SaveProfileAsync(input);
            PopulateProfile();
            RefreshVisualState();
            SetupExpander.IsExpanded = false;
        }
        catch (Exception error)
        {
            SetupErrorText.Text = error.Message;
        }
        finally
        {
            SetBusy(false, ViewModel.StatusText);
        }
    }

    private async void RunNow_Click(object sender, RoutedEventArgs e)
    {
        SetBusy(true, "Starting daily search");
        try
        {
            var progress = new Progress<WorkerEvent>(runEvent =>
            {
                RunStatusText.Text = runEvent.Message;
                TitleStatusPillText.Text = runEvent.Message;
            });
            await ViewModel.RefreshAsync(progress);
            RefreshVisualState();
        }
        catch (Exception error)
        {
            RunStatusText.Text = error.Message;
        }
        finally
        {
            SetBusy(false, ViewModel.StatusText);
        }
    }

    private void SearchBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        ViewModel.Filter(SearchBox.Text);
    }

    private static List<string> SplitPreferences(string value) => value
        .Split([',', ';', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .ToList();

    private void SetBusy(bool busy, string message)
    {
        RunProgress.IsActive = busy;
        RunStatusText.Text = message;
        TitleStatusPillText.Text = busy ? message : "Local-first and private";
        TitleStatusText.Text = busy ? message : "Local-first · Private";
    }

    private void OpenUrl_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as Button)?.Tag is string url && Uri.TryCreate(url, UriKind.Absolute, out _))
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }

    private void OpenFile_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as Button)?.Tag is string file && File.Exists(file))
            Process.Start(new ProcessStartInfo(file) { UseShellExecute = true });
    }

    private void RevealFile_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as Button)?.Tag is string file && File.Exists(file))
            Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{file}\"") { UseShellExecute = true });
    }

    private void OpenDocuments_Click(object sender, RoutedEventArgs e)
    {
        var path = ViewModel.Profile?.MasterCvPath;
        if (!string.IsNullOrWhiteSpace(path) && File.Exists(path))
            Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{path}\"") { UseShellExecute = true });
        else
            SetupExpander.IsExpanded = true;
    }

    private void MainWindow_SizeChanged(object sender, WindowSizeChangedEventArgs args) =>
        ApplyResponsiveLayout(args.Size.Width);

    private void ApplyResponsiveLayout(double width)
    {
        var narrow = width < 960;
        SidebarColumn.Width = new GridLength(narrow ? 72 : 220);
        TitleSidebarColumn.Width = new GridLength(narrow ? 62 : 226);
        SidebarPanel.Padding = new Thickness(narrow ? 10 : 16);
        WorkspaceLabel.Visibility = narrow ? Visibility.Collapsed : Visibility.Visible;
        OpportunitiesLabel.Visibility = narrow ? Visibility.Collapsed : Visibility.Visible;
        DocumentsLabel.Visibility = narrow ? Visibility.Collapsed : Visibility.Visible;
        PrivacyText.Visibility = narrow ? Visibility.Collapsed : Visibility.Visible;
        SidebarScheduleText.Visibility = narrow ? Visibility.Collapsed : Visibility.Visible;
        MainContentGrid.Margin = narrow ? new Thickness(18, 22, 18, 34) : new Thickness(34, 26, 34, 40);
        TitleWorkspaceLabel.Visibility = width < 720 ? Visibility.Collapsed : Visibility.Visible;
        TitleStatusPill.Visibility = width < 1000 ? Visibility.Collapsed : Visibility.Visible;

        SetupGrid.ColumnDefinitions[0].Width = new GridLength(1, GridUnitType.Star);
        SetupGrid.ColumnDefinitions[1].Width = narrow ? new GridLength(0) : new GridLength(1, GridUnitType.Star);
        PositionSetupField(NameField, 0, 0);
        PositionSetupField(CvField, narrow ? 1 : 0, narrow ? 0 : 1);
        PositionSetupField(RolesField, narrow ? 2 : 1, 0);
        PositionSetupField(LocationsField, narrow ? 3 : 1, narrow ? 0 : 1);
        PositionSetupField(ScheduleField, narrow ? 4 : 2, 0);
        PositionSetupField(ScheduleToggle, narrow ? 5 : 2, narrow ? 0 : 1);
        PositionSetupField(ModelField, narrow ? 6 : 3, 0);
        PositionSetupField(ReasoningField, narrow ? 7 : 3, narrow ? 0 : 1);
        PositionSetupField(SaveField, narrow ? 8 : 4, 0);

        ApplyContentLayout(Math.Max(0, width - (narrow ? 72 : 220)));
    }

    private void ContentScroll_SizeChanged(object sender, SizeChangedEventArgs args)
    {
        var scale = ContentScroll.XamlRoot?.RasterizationScale ?? 1;
        ApplyContentLayout(args.NewSize.Width / Math.Max(1, scale));
    }

    private void ApplyContentLayout(double detailWidth)
    {
        var narrow = SidebarColumn.Width.Value < 100;
        var horizontalMargins = narrow ? 36 : 68;
        MainContentGrid.Width = Math.Max(320, Math.Min(1180, detailWidth - horizontalMargins));
        var compact = MainContentGrid.Width < 1050;
        MetricsGrid.ColumnDefinitions[0].Width = new GridLength(1, GridUnitType.Star);
        MetricsGrid.ColumnDefinitions[1].Width = new GridLength(1, GridUnitType.Star);
        MetricsGrid.ColumnDefinitions[2].Width = compact ? new GridLength(0) : new GridLength(1, GridUnitType.Star);
        MetricsGrid.ColumnDefinitions[3].Width = compact ? new GridLength(0) : new GridLength(1, GridUnitType.Star);
        Grid.SetRow(TrackedMetric, 0);
        Grid.SetColumn(TrackedMetric, 0);
        Grid.SetRow(StrongMetric, 0);
        Grid.SetColumn(StrongMetric, 1);
        Grid.SetRow(DocumentsMetric, compact ? 1 : 0);
        Grid.SetColumn(DocumentsMetric, compact ? 0 : 2);
        Grid.SetRow(AppliedMetric, compact ? 1 : 0);
        Grid.SetColumn(AppliedMetric, compact ? 1 : 3);

        InsightsGrid.ColumnDefinitions[0].Width = new GridLength(1, GridUnitType.Star);
        InsightsGrid.ColumnDefinitions[1].Width = compact ? new GridLength(0) : new GridLength(1, GridUnitType.Star);
        Grid.SetRow(PipelineCard, 0);
        Grid.SetColumn(PipelineCard, 0);
        Grid.SetRow(OpportunityMixCard, compact ? 1 : 0);
        Grid.SetColumn(OpportunityMixCard, compact ? 0 : 1);

        Grid.SetRow(RunNowButton, compact ? 1 : 0);
        Grid.SetColumn(RunNowButton, compact ? 0 : 1);
        RunNowButton.Margin = compact ? new Thickness(0, 14, 0, 0) : new Thickness(0);
        SearchColumn.Width = new GridLength(MainContentGrid.Width < 720 ? 210 : 320);
    }

    private static void PositionSetupField(FrameworkElement field, int row, int column)
    {
        Grid.SetRow(field, row);
        Grid.SetColumn(field, column);
    }
}
