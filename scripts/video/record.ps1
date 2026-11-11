$ErrorActionPreference = 'Continue'
$adb = "C:\Users\nitis\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$out = "C:\nsvid\raw3"
New-Item -ItemType Directory -Force $out | Out-Null
$ev = New-Object System.Collections.Generic.List[string]
function Now { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
function Log($n) { $ev.Add("$n,$(Now)") }
function Tap($n, $x, $y) { Log $n; & $adb shell input tap $x $y | Out-Null }
function SongCount { (& $adb shell run-as com.namesinger.app ls files/songs | Where-Object { $_ -match '\.json$' } | Measure-Object).Count }

$before = SongCount
& $adb shell am force-stop com.namesinger.app
& $adb shell monkey -p com.namesinger.app -c android.intent.category.LAUNCHER 1 | Out-Null
Start-Sleep 12

function StartRec($name) {
    Log "start_$name"
    Start-Process -FilePath $adb -ArgumentList 'shell', 'screenrecord', '--bit-rate', '14000000', '--time-limit', '180', "/sdcard/$name.mp4" -WindowStyle Hidden -PassThru
}
$r1 = StartRec 'rec1'
Start-Sleep 4
Tap 'field' 540 1305; Start-Sleep 1.5
foreach ($ch in 'S', 'a', 'm') { Log "type_$ch"; & $adb shell input text $ch | Out-Null; Start-Sleep -Milliseconds 450 }
Start-Sleep 1
Log 'kb_back'; & $adb shell input keyevent 4 | Out-Null; Start-Sleep 1.2
Tap 'acoustic' 540 1799; Start-Sleep 1.3
Tap 'pop' 220 1799; Start-Sleep 1.3
Tap 'generate' 540 2018

$r1.WaitForExit()
Log 'rec1_end'
$r2 = StartRec 'rec2'
while ((SongCount) -le $before) { Start-Sleep -Milliseconds 700 }
Log 'song_file_done'
$d = Now
# wait for autoplay and let it play a while
Start-Sleep 2.4
Tap 'pause1' 541 1806; Start-Sleep 2.5
Tap 'resume' 541 1806; Start-Sleep 2.6
Tap 'seek' 300 1520; Start-Sleep 10.5
Tap 'replay' 297 2022; Start-Sleep 5
Tap 'pause2' 541 1806; Start-Sleep 1.5
Tap 'save' 540 2022; Start-Sleep 3.5
Tap 'share' 784 1977; Start-Sleep 4.5
Log 'share_back'; & $adb shell input keyevent 4 | Out-Null; Start-Sleep 3
& $adb shell pkill -2 screenrecord | Out-Null
$r2.WaitForExit(15000) | Out-Null
Start-Sleep 2
Log 'rec2_end'
& $adb pull /sdcard/rec1.mp4 "$out\rec1.mp4" | Out-Null
& $adb pull /sdcard/rec2.mp4 "$out\rec2.mp4" | Out-Null
$ev | Set-Content "$out\events.csv"
"finished"
