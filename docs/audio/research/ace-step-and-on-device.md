# ACE-Step + on-device feasibility (researched 2026-11-06)
Legend: [V]=verified from primary page read; [C]=vendor claim; [E]=my estimate.

## 1. ACE-Step
- Versions [V]: v1 (3.5B, Apache-2.0 per HF card https://huggingface.co/ACE-Step/ACE-Step-v1-3.5B); v1.5 (2B DiT turbo/sft/base + 5Hz LMs 0.6B/1.7B/4B; https://huggingface.co/ACE-Step/Ace-Step1.5); 1.5 XL (4B DiT, released 2026-04-02: xl-base/xl-sft/xl-turbo; ~18.8GB bf16 weights) https://github.com/ace-step/ACE-Step-1.5
- License [V]: code repo LICENSE = MIT (Copyright 2026 ACEStep) https://raw.githubusercontent.com/ace-step/ACE-Step-1.5/main/LICENSE ; HF API metadata for xl-turbo = license:mit; Ace-Step1.5 card says MIT. Card says generated music may be used commercially; trained on licensed + royalty-free + synthetic MIDI data [C - dataset legality is the authors' claim, not audited]. v1 weights were Apache-2.0.
- Languages [C/partial]: "50+ languages" (README, card). ComfyUI blog says strongest in en, zh, ja, ko, es, de, fr, pt, it, ru. Hindi/Tamil/Telugu are NOT listed for the generator. The sibling transcriber model lists Hindi, Bengali, Tamil, Urdu (https://huggingface.co/ACE-Step/acestep-transcriber) but that is a lyric-transcription labeller, not evidence of good sung output. v1 card: "performance varies by language (top 10 best)", "coarse vocal synthesis". No Hindi/Tamil sung-quality evidence found.
- User lyrics with a name [V that lyric input exists]: lyrics field takes text with [Verse]/[Chorus] tags; so a name can be in lyrics. Pronunciation of Indian names/languages unverified; "gacha-style" seed variance noted in v1 card.
- Quality [C]: README says "between Suno v4.5 and v5". Independent-ish table in YuE2 README (a competitor, WildSongBench): ACE-Step 1.5 SongBench 6.01 vs Suno v5 6.87, YuE2 6.73 https://github.com/multimodal-art-projection/YuE . Reddit/Facebook threads report weak XL-SFT results. Treat quality as "good open model, below top commercial".
- Hardware [V from README]: <=6GB VRAM: 2B turbo, no LM, INT8+CPU offload ("<4GB" headline); 6-8GB + LM 0.6B; XL needs >=12GB (offload+INT8), >=20GB recommended. Speed [C]: <2s/song on A100, <10s on RTX 3090 (song length not stated in README; v1 card RTF 34x on 4090 at 27 steps, M2 Max 2.27x). Apple Silicon via MLX scripts; CPU/Intel/AMD supported (slow, no numbers).
- Ports [V]: community acestep.cpp (GGML, MIT; CPU/CUDA/Metal/Vulkan; has buildtermux.sh) + GGUF https://huggingface.co/Serveurperso/ACE-Step-1.5-GGUF ; README sizes: LM 4B Q8 4.2GB, text-enc 748MB, DiT turbo Q8 2.4GB, VAE 322MB. No ONNX/CoreML/TFLite or Android benchmark found.
- Hosted price [V, but v1 model]: fal.ai $0.0002 per second of generated audio (https://fal.ai/models/fal-ai/ace-step) ; Replicate lucataco/ace-step ~ $0.024/run (https://replicate.com/lucataco/ace-step). I did NOT find a fal/Replicate listing for 1.5 or XL; HF Inference Providers: none deploy it. Official free site acemusic.ai claimed free (not verified).
- "UE2": no ACE-Step "UE2" exists. Closest real thing is **YuE2** (separate model, M-A-P/HKUST, repo multimodal-art-projection/YuE): code Apache-2.0, weights CC BY-NC 4.0 + "creator permission" (free for individuals to monetize outputs, companies must negotiate commercial license), needs 24GB VRAM. Not ACE-Step. Probably what user meant.

## 2. Fully on-device on low-end Android
Verdict: NOT credible for neural full-song generation on 3-4GB phones.
- ACE-Step GGUF smallest set: DiT 2.4GB + enc 0.75GB + VAE 0.32GB (+LM) ~3.5GB+ weights alone, before activations; no phone benchmark exists [E: infeasible on 3-4GB RAM, would be minutes-to-never on mid CPUs].
- Stable Audio Open Small (341M, Arm-optimised, 11s clips): ~8s for 10s audio on PREMIUM phones [C, Arm/Stability]; license Stability Community License (commercial terms via stability.ai/license); HF card: "not able to generate realistic vocals". So instruments/SFX only, no singing. https://huggingface.co/stabilityai/stable-audio-open-small
- On-device TTS (speech, not singing): Piper (~61-63MB voices; Hindi voices priyamvada/rohan ~63MB at piper.ttstool.com; MIT repo, per-voice licenses vary); Kokoro-82M (Apache-2.0, ~115MB on-demand in NekoSpeak, ~326MB fp32 ONNX; 1.2GB RSS in one HF benchmark); Supertonic-3 (~99M params, MIT code + OpenRAIL-M model, 31 languages incl. Hindi, NOT Tamil/Telugu). Picovoice benchmark: Piper 61MB, Supertonic2 262MB, Kokoro 341MB. None advertise singing. Singing voice synthesis (DiffSinger) exists in PyTorch/Python, no phone port or Indian-language voicebank verified.
- Realistic on-device alternative [E]: speak name via Piper/Supertonic and mix over pre-rendered (server-made or bundled) backing tracks; that is TTS + mixing, not neural singing.

## 3. Self-host cost per song (estimates)
Prices: RunPod pods page, updated Nov 4 2026 (https://www.runpod.io/pricing): RTX 3090 $0.50/hr, 4090 $0.89/hr, A100 80GB $1.79/hr; serverless 24GB tier $0.75/hr. Rate 95.25 INR/USD. Speeds are vendor claims (<10s on 3090, <2s on A100, length unspecified) so I show a 6x pessimistic row incl. load/idle.
| Setup | sec/song | USD | INR [E] |
| 3090 pod, claim | 10 | 0.00139 | 0.13 |
| 3090 pod, pessimistic | 60 | 0.00833 | 0.79 |
| A100 pod, claim | 2 | 0.00099 | 0.09 |
| A100 pod, pessimistic | 30 | 0.01492 | 1.42 |
| Serverless 24GB, claim | 10 | 0.00208 | 0.20 |
| Serverless 24GB, pessimistic | 60 | 0.0125 | 1.19 |
Hosted v1 for comparison: fal $0.0002/s -> 60s song $0.012 = INR 1.14; 180s = INR 3.43; Replicate $0.024/run = INR 2.29.
Not included: idle GPU, storage ($0.07-0.10/GB/mo), retries from "gacha" quality (budget 2-4 generations per keeper => multiply), engineering. A pod kept up 24/7 on a 3090 = $360/mo = INR ~34,300 regardless of songs.
