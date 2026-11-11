# Hosted song-generation APIs (retrieved 2026-11-06)
Target: < INR 1 (= USD 0.0105) per successful song; INR 95.25/USD; 10% failed+retried (cost = price/0.9).

| Provider | Verified price | $/successful | INR/successful | <INR 1? |
|---|---|---|---|---|
| Mureka v8 on fal (lyrics) | $0.045/song | 0.0500 | 4.76 (4.29 if failures unbilled) | NO |
| Mureka v8 on fal (prompt only) | $0.30/song | 0.333 | 31.75 | NO |
| MiniMax music-3.0 / 2.5 / 2.6 | $0.15/track (<=5 min); Music-2.0 $0.03 | 0.167 / 0.033 | 15.9 / 3.17 | NO (and closed to new users) |
| Sonauto = Treblo (Melodia v3) | 100 credits/song; $0.06/100 cr payg (Enterprise $0.04) | 0.0667 / 0.0444 | 6.35 / 4.23 | NO |
| Google Lyria 3.5 (compare) | $0.08/song | 0.0889 | 8.47 | NO |
| ElevenLabs Music (compare) | $0.15/minute | 0.1667/min | 15.9/min (~31.75 for 2 min) | NO |

## (a) Mureka v8 on fal - https://fal.ai/models/mureka/v8/generate/song (scraped live, maxAge 0)
- Price, exact: "Billing is calculated per generated song. When you provide lyrics, your request will cost $0.045 per song; when you provide only a prompt without lyrics, it will cost $0.30 per song. Each request returns one song. For $1 you can generate about 22 songs from your own lyrics or 3 songs from a prompt alone." Flat per song; no duration scaling stated (sample output 167.59 s, mp3, audio/mpeg, ~5.4 MB).
- Supplied lyrics: yes, `lyrics` string up to 5,000 chars; `prompt` (<=1,024 chars with lyrics) = style control; `gender` female/male; optional reference_id/vocal_id/melody_id. Output: song_id, audio file URL (mp3), duration ms, timed lyrics_sections (word-level timestamps). Source: .../api page.
- Languages: NOT stated on the fal page. Mureka site snippets mention English, Chinese, Japanese, Korean, Spanish "and other languages" (mureka.ai/blog_en/mureka-features.html; a YouTube tutorial snippet lists "English, Chinese, Japanese, Korean ..."). Hindi/Tamil/Telugu: NOT verified. Must be tested empirically.
- Commercial: fal page shows a "Commercial use" badge. fal FAQ (fal.ai/docs/documentation/model-apis/faq): "Each model has its own license. Most models on fal are available for commercial use and are marked with a Commercial use badge." fal ToS: Company gives no warranty outputs are non-infringing; third-party provider terms may apply. Mureka's own license terms NOT read/verified.
- Retention: FAQ: "Generated media files ... stored on the fal CDN and available for at least 7 days by default." Retention of request payloads/lyrics: NOT stated.
- Rate limit: "New accounts start at 2 concurrent requests. As you purchase credits, the limit increases automatically up to 40."
- Failures: FAQ: "Server errors (HTTP 500+) are never charged... Client-side errors like invalid inputs (HTTP 422) may still be charged."
- Latency: no figure on page; queue API with webhooks. NOT verified (would require paid run).
- Other fal song models: not browsed (out of scope); no cheaper one verified.

## (b) MiniMax Music (official) - platform.minimax.io
- Closed: https://platform.minimax.io/docs/api-reference/api-overview : "Starting August 20, 2026, the paid APIs (Music Generation and Lyrics Generation) will no longer be available to new users; existing paying users can continue... The free music generation APIs (Music-3.0-free, Music-2.6-free, music-cover-free) will be discontinued." Confirms the earlier report. Alternatives offered: MiniMax Audio web, open-weights MiniMax Music 3 on Hugging Face/ModelScope (self-host; license not checked).
- Price (existing payers only), pricing page https://platform.minimax.io/docs/guides/pricing-paygo : "Music-3.0 $0.15 per track (up to 5 minutes)"; Music-2.6/2.5+/2.5 same; "Music-2.0 $0.03 per track"; "Lyrics Generation $0.01 per song".
- Lyrics supplied: yes (`lyrics` field with [verse]/[chorus] tags; model music-3.0). Languages, commercial terms, latency: not found on the API page (NOT verified).

## (c) Sonauto is now Treblo (sonauto.ai redirects to treblo.com)
- Confirmed rename: "We've changed our name from Sonauto to Treblo" (https://sonauto.ai/developers -> treblo.com/developers).
- Pricing https://treblo.com/developers/pricing : "One song costs 100 credits. Setting num_songs to 2 costs 150 credits." Starter $11/mo 20,000 credits (200 songs); Pro $88 = 160,000 (1,600); Scale $330 = 660,000; Enterprise $1,150 = 2,875,000 (28,750); payg $0.06 / 100 credits (Scale $0.05, Enterprise $0.04). Free trial: 3,000 credits (~30 songs) after card verification. Effective $0.04-0.06 per song.
- Attribution: "Any user-facing implementation of our API requires proper attribution to Treblo." API Terms (https://treblo.com/api-terms): must display "Powered By Treblo" link; waivable by commercial agreement.
- Commercial: API Terms grant use "in commercial products, applications, and services you offer to your own end users"; user owns outputs "to the extent permitted by applicable law". Retention: "We retain API request and output records to operate the service and for billing."
- Lyrics supplied / rate limits / latency: docs page returned no extractable detail (NOT verified). Marketing: "~15s to first audio" (vendor claim). Languages: treblo.com snippet says it "can also sing in Japanese, Korean, Chinese, Arabic, Russian, Hindi... but the pronunciation may be off" (marketing, advertised only).

## (d) Comparison-only
- Google Lyria: official https://ai.google.dev/gemini-api/docs/pricing : Lyria 3.5 full song $0.08 per song; Lyria 3 Clip (30s) $0.04; Lyria 3 Pro $0.08.
- ElevenLabs Music: https://elevenlabs.io/pricing/api : "Eleven Music $0.15 per minute".

## Conclusion
No verified option is under INR 1. Cheapest verified: Mureka v8 lyrics on fal at ~INR 4.3-4.8 per successful song (~4.1-4.5x the budget). Treblo Enterprise ~INR 4.2 needs a $1,150/mo plan plus attribution. Hitting INR 1 needs self-hosted/open-weights (e.g., MiniMax Music 3 weights) or non-song architecture (e.g., TTS + stock backing track). Nothing was run or paid for; latency and Indian-language quality are unverified.
