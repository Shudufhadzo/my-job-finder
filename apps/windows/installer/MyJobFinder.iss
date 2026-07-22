#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\..\..\artifacts\MyJobFinder-windows-x64"
#endif
#ifndef OutputDir
  #define OutputDir "..\..\..\artifacts"
#endif

#define AppName "My Job Finder"
#define AppPublisher "My Job Finder contributors"
#define AppExeName "MyJobFinder.exe"

[Setup]
AppId={{D836A6B4-7339-49A3-931D-5DC53152508C}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL=https://github.com/Shudufhadzo/my-job-finder
AppSupportURL=https://github.com/Shudufhadzo/my-job-finder/issues
AppUpdatesURL=https://github.com/Shudufhadzo/my-job-finder/releases
DefaultDirName={localappdata}\Programs\My Job Finder
DefaultGroupName=My Job Finder
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename=MyJobFinder-Setup
Compression=lzma2/normal
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#AppExeName}
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
VersionInfoVersion={#AppVersion}.0
VersionInfoCompany={#AppPublisher}
VersionInfoDescription=My Job Finder installer
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\My Job Finder"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\My Job Finder"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch My Job Finder"; Flags: nowait postinstall skipifsilent
