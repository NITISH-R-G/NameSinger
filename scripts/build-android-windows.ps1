<#
  Builds the NameSinger Android development APK on Windows.

  WHY A MIRROR: the Android C++ build (CMake + ninja) writes object files under a path that embeds the
  full source path, and ninja fails above 260 characters. This project lives at a long path, so the
  native compile cannot run in place. The mirror (default C:\ns) is a short-path BUILD COPY only.

  SOURCE OF TRUTH: this project folder. Nothing is ever edited in the mirror, and nothing in it is
  copied back except the finished APK. Every run:
    1. mirrors the sources (everything except node_modules, android, ios, caches) from the project
       with robocopy /MIR, so files deleted in the project are deleted in the mirror too;
    2. copies the project's installed node_modules into the mirror (no install is run) and checks the
       installed-package record (.package-lock.json) matches;
    3. VERIFIES the mirror: a SHA-256 manifest of the sources is computed on both sides and the build
       stops if they differ;
    4. regenerates the android/ project in the mirror with `expo prebuild --clean` (Continuous Native
       Generation: android/ is never hand-edited and does not exist in the project);
    5. runs Gradle, then copies the APK to <project>\.native-build\ together with source-manifest.txt,
       the manifest the APK was built from.

  JavaScript is NOT taken from the mirror at run time: the debug APK loads JS from Metro, which should
  serve the PROJECT folder (npx expo start --dev-client).

  Usage:  powershell -File scripts\build-android-windows.ps1 [-Mirror C:\ns] [-Abi x86_64]
#>
param(
  [string]$Mirror = 'C:\ns',
  [string]$Abi = 'x86_64',
  [switch]$SkipGradle
)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$env:JAVA_HOME = $env:JAVA_HOME
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$env:Path = "$env:JAVA_HOME\bin;C:\Program Files\nodejs;$env:Path"

$excludeDirs = @('node_modules', 'android', 'ios', '.expo', '.git', '.gradle', '.native-build', 'research')

function Get-SourceManifest([string]$root) {
  $files = Get-ChildItem -LiteralPath $root -Recurse -File -Force |
    Where-Object {
      $rel = $_.FullName.Substring($root.Length).TrimStart('\')
      $top = $rel.Split('\')[0]
      ($excludeDirs -notcontains $top) -and ($_.Extension -ne '.log') -and ($_.Name -ne '.lock-hash')
    } | Sort-Object FullName
  $files | ForEach-Object {
    $rel = $_.FullName.Substring($root.Length).TrimStart('\').Replace('\', '/')
    '{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash, $rel
  }
}

Write-Host "== 1. sync sources: $project -> $Mirror"
# Full paths on BOTH sides: names alone would also skip modules\refractive-glass\android (native source),
# and project-side paths alone would let /MIR purge the mirror's own node_modules and android.
$xd = @($excludeDirs | ForEach-Object { Join-Path $project $_ }) + @($excludeDirs | ForEach-Object { Join-Path $Mirror $_ })
robocopy $project $Mirror /MIR /XD @xd /XF *.log .lock-hash /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }

Write-Host '== 2. node_modules: a copy of the project install (nothing is installed, removed or upgraded)'
# The mirror gets exactly the tree the project already has, so the build uses the dependencies the app and
# tests run against. npm records what is installed in node_modules\.package-lock.json: it must match.
robocopy (Join-Path $project 'node_modules') (Join-Path $Mirror 'node_modules') /MIR /NFL /NDL /NJH /NJS /NP /MT:16 | Out-Null
if ($LASTEXITCODE -ge 8) { throw "node_modules copy failed ($LASTEXITCODE)" }
$ph = (Get-FileHash (Join-Path $project 'node_modules\.package-lock.json') -Algorithm SHA256).Hash
$mh = (Get-FileHash (Join-Path $Mirror 'node_modules\.package-lock.json') -Algorithm SHA256).Hash
if ($ph -ne $mh) { throw 'Mirror node_modules does not match the project install: refusing to build.' }
Write-Host '   node_modules identical (installed-package record matches)'

Write-Host '== 3. verify the mirror matches the project'
$a = Get-SourceManifest $project
$b = Get-SourceManifest $Mirror
$diff = Compare-Object $a $b
if ($diff) { $diff | Select-Object -First 20 | Out-String | Write-Host; throw 'Mirror differs from the project: refusing to build.' }
Write-Host ("   {0} files identical" -f $a.Count)

Write-Host '== 4. regenerate android/ in the mirror (expo prebuild)'
Push-Location $Mirror
try {
  npx expo prebuild --platform android --clean --no-install
  if ($LASTEXITCODE -ne 0) { throw 'prebuild failed' }
  "sdk.dir=$($env:ANDROID_HOME.Replace('\','/'))" | Set-Content (Join-Path $Mirror 'android\local.properties') -Encoding ascii
} finally { Pop-Location }

if ($SkipGradle) { return }
Write-Host '== 5. gradle assembleDebug'
Push-Location (Join-Path $Mirror 'android')
try {
  .\gradlew.bat assembleDebug "-PreactNativeArchitectures=$Abi" --console=plain
  if ($LASTEXITCODE -ne 0) { throw 'gradle failed' }
} finally { Pop-Location }

$out = Join-Path $project '.native-build'
New-Item -ItemType Directory -Force $out | Out-Null
Copy-Item (Join-Path $Mirror 'android\app\build\outputs\apk\debug\app-debug.apk') $out -Force
$a | Set-Content (Join-Path $out 'source-manifest.txt')
$apkHash = (Get-FileHash (Join-Path $out 'app-debug.apk') -Algorithm SHA256).Hash
Write-Host "== done: $out\app-debug.apk  sha256=$apkHash  built from $($a.Count) verified source files"
