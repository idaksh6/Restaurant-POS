[Setup]
AppId={{4B7E2D10-93A5-4C6F-B8E1-7D2F0A9C5E31}}
AppName=Isarva POS Print Agent
AppVersion=1.0.0
AppPublisher=Isarva Infotech
DefaultDirName={localappdata}\Programs\Isarva-Print-Agent
DefaultGroupName=Isarva POS Print Agent
DisableProgramGroupPage=yes
OutputDir=..\release-agent
OutputBaseFilename=Isarva-Print-Agent-Setup
SetupIconFile=assets\icon.ico
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
WizardStyle=modern
UninstallDisplayIcon={app}\Isarva POS Print Agent.exe
UninstallDisplayName=Isarva POS Print Agent
CloseApplications=force
RestartApplications=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\release-agent\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Isarva POS Print Agent"; Filename: "{app}\Isarva POS Print Agent.exe"; WorkingDir: "{app}"

[Registry]
; Start hidden in the tray at Windows sign-in (the agent can turn this off from its tray menu).
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "IsarvaPrintAgent"; ValueData: """{app}\Isarva POS Print Agent.exe"" --hidden"; Flags: uninsdeletevalue

[Run]
Filename: "{app}\Isarva POS Print Agent.exe"; Description: "Start the print agent"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{cmd}"; Parameters: "/C taskkill /IM ""Isarva POS Print Agent.exe"" /F"; Flags: runhidden; RunOnceId: "KillAgent"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
