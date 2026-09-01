[Setup]
AppId={{8F3C1A9E-6B21-4D55-9E2A-A1B2C3D4E5F6}}
AppName=Mesa POS
AppVersion=0.1.0
AppPublisher=Mesa
DefaultDirName={localappdata}\Programs\Mesa-POS
DefaultGroupName=Mesa POS
DisableProgramGroupPage=yes
OutputDir=..\release
OutputBaseFilename=Mesa-POS-Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
WizardStyle=modern
UninstallDisplayIcon={app}\Mesa POS.exe
UninstallDisplayName=Mesa POS
CloseApplications=yes
RestartApplications=no
SetupIconFile=
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: checkedonce

[Files]
Source: "..\release\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Mesa POS"; Filename: "{app}\Mesa POS.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Mesa POS"; Filename: "{app}\Mesa POS.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\MesaPOS"; Flags: deletekey uninsdeletekey

[Run]
Filename: "{app}\Mesa POS.exe"; Description: "Open Mesa POS"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
; Electron keeps activation, tickets, and Chromium localStorage here — not in the install folder.
Type: filesandordirs; Name: "{userappdata}\Mesa POS"
Type: filesandordirs; Name: "{localappdata}\Mesa POS"
