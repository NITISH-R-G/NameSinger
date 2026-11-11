Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft Zira Desktop')
$s.Rate = 0
$lines = [ordered]@{
  n1 = 'NameSinger. Type a name. Your phone sings it.'
  n2 = 'Enter a name, choose an occasion and a style, then tap Generate.'
  n3 = 'A music model runs entirely on the phone. No server, no account. It takes a few minutes, so here the wait is sped up.'
  n5 = 'Replay it, save it to your music folder, or share it.'
  n6 = 'NameSinger runs locally on Android. Get the code and the app on GitHub.'
}
New-Item -ItemType Directory -Force C:\nsvid\tts | Out-Null
foreach ($k in $lines.Keys) {
  $s.SetOutputToWaveFile("C:\nsvid\tts\$k.wav")
  $s.Speak($lines[$k])
  $s.SetOutputToNull()
}
"ok"
