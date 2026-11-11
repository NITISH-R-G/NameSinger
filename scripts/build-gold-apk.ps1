<#
  Builds the standalone NameSinger (gold) arm64 debug APK on Windows into its OWN output folder,
  never touching the approved APKs in .native-build\ (app-debug.apk, arm64-v8a\, standalone-arm64\).

  Steps: mirror + verify + prebuild via build-android-windows.ps1 -SkipGradle, then a MIRROR-ONLY patch that
  embeds the JS bundle in the debug variant (debuggableVariants = []), then gradle assembleDebug for arm64-v8a.
  The project's own files are not patched.
#>
param([string]$Mirror = 'C:\n', [string]$OutName = 'namesinger-killa')
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
& (Join-Path $PSScriptRoot 'build-android-windows.ps1') -Mirror $Mirror -Abi arm64-v8a -SkipGradle

$gradle = Join-Path $Mirror 'android\app\build.gradle'
$text = [IO.File]::ReadAllText($gradle)
$patched = [regex]::Replace($text, '(?m)^(\s*)// debuggableVariants = \["liteDebug", "prodDebug"\]\r?$', '$0' + "`n" + '$1debuggableVariants = []')
if ($patched -eq $text -and $text -notmatch '(?m)^\s*debuggableVariants = \[\]') { throw 'could not patch debuggableVariants' }
[IO.File]::WriteAllText($gradle, $patched, (New-Object Text.UTF8Encoding($false)))

$env:JAVA_HOME = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:\Program Files\Android\Android Studio\jbr' }
$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$env:Path = "$env:JAVA_HOME\bin;C:\Program Files\nodejs;$env:Path"
Push-Location (Join-Path $Mirror 'android')
try {
  .\gradlew.bat assembleDebug "-PreactNativeArchitectures=arm64-v8a" --console=plain
  if ($LASTEXITCODE -ne 0) { throw 'gradle failed' }
} finally { Pop-Location }

$out = Join-Path $project (Join-Path '.native-build' $OutName)
New-Item -ItemType Directory -Force $out | Out-Null
$apk = Get-ChildItem (Join-Path $Mirror 'android\app\build\outputs\apk\debug') -Filter *.apk | Select-Object -First 1
Copy-Item $apk.FullName (Join-Path $out 'NameSinger-killa-debug-arm64.apk') -Force
$h = (Get-FileHash (Join-Path $out 'NameSinger-killa-debug-arm64.apk') -Algorithm SHA256).Hash
Write-Host "== done: $out\NameSinger-killa-debug-arm64.apk sha256=$h"

