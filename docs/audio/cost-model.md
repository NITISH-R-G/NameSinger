# NameSinger: cost model

- **Date:** 2026-11-07
- **Target:** under ₹1 per **successful** personalized song, not per API request.
- **Exchange rate:** ₹95.25 per US dollar. This comes from the earlier research notes (an RBI reference rate dated 2026-10-30) and was **not re-verified** today. Sensitivity: a rate of ₹100 raises every dollar figure by 5%.
- **Calculations:** `cost_calc` script run on 2026-11-07; the formulas are stated under each table.

## 0. How to read the numbers

| Tag | Meaning |
|---|---|
| **Advertised** | A price on a provider page (retrieved 2026-11-06 by the research agents, from public pages only). **No paid call has been made**, so no provider price was tested. |
| **Measured** | Run in this repository (Node or the Android emulator). |
| **Assumption** | A number I chose and say so. |
| **Estimate** | Arithmetic from the above. |

Free tiers are not counted as sustainable pricing.

## 1. Inputs

| Input | Value | Tag and source |
|---|---|---|
| Mureka v8 on fal, with supplied lyrics | $0.045 per song ($0.30 without lyrics) | Advertised: fal.ai/models/mureka/v8/generate/song |
| BlueMetal | $0.0095 per song, billed on success; $0.10 free credit | Advertised: bluemetal.ai docs, terms, OpenAPI. Docs and homepage disagree on the 100-song pack ($0.85 versus $0.95). Fees, minimums, FX and GST not found |
| MiniMax Music | $0.15 (3.0), $0.03 (2.0) per track | Advertised, but **closed to new users since 2026-08-20** |
| Sonauto / Treblo | $0.06 per song (pay as you go) | Advertised: treblo.com/developers/pricing |
| Google Lyria 3.5 | $0.08 per song | Advertised: ai.google.dev pricing (comparison only) |
| ACE-Step v1 on fal | $0.0002 per second of audio | Advertised: fal.ai/models/fal-ai/ace-step (the 1.5 and XL versions are not listed on fal) |
| RTX 3090 pod | $0.50 per hour | Advertised: runpod.io pricing (updated 2026-11-04) |
| Paid CDN egress | $0.109 per GB | From the earlier research (CloudFront India); not re-verified |
| Failed-and-retried provider jobs | 10% | **Assumption** |
| On-device render time | 2.2 to 2.4 s (Hermes, Android 15 emulator); 0.14 to 0.27 s (Node) | **Measured** |
| Song size | 0.97 MB per 22 s WAV; demo instrumental asset 0.47 MB | **Measured** |

## 2. Cost per successful song (INR)

Formula for hosted options: `price / (1 - 0.10) x 95.25`, except BlueMetal, which is billed only on success, so `price x 95.25` (and `x 2` if half of the outputs are unusable).

| Option | INR per successful song | Under ₹1? | Notes |
|---|---|---|---|
| A1. Mureka v8 on fal, supplied lyrics | **4.76** | No | 4.8x over budget |
| A2. BlueMetal, first output always usable | **0.90** | Yes, barely | Best case only; no fees, taxes or FX included |
| A2b. BlueMetal, half the outputs unusable | **1.81** | No | The name and lyrics cannot be forced, so retries are likely |
| A3. Google Lyria 3.5 | 8.47 | No | Comparison |
| A4. ACE-Step v1 on fal (60 s) | 1.27 | No | Indian-language quality unverified |
| A5. ACE-Step on a rented 3090, 60 s per song | 0.88 | Yes | Excludes idle GPU time; the vendor claim is 10 s (₹0.13); a pod left on 24/7 costs about ₹34,000 a month regardless of use (estimate from the research) |
| **B. On-device template with the user's recorded name** | **0 marginal** | **Yes** | See section 3 |
| C. On-device neural model | 0 marginal per song | Yes in cost, no in feasibility | Weights 3.5 GB or more per install (about ₹36 of paid-CDN egress, estimate) |

## 3. Option B in detail (the chosen design)

| Cost item | Value | Tag |
|---|---|---|
| Speech capture, recognition, TTS | ₹0 (the recording is used as is; no speech recognition or TTS) | Design fact |
| Music generation per user | ₹0 (the base songs are made once) | Design fact |
| Audio processing, backend compute | ₹0 (runs on the phone; no server) | Design fact; on-device time **measured** |
| Queue, database, Redis | ₹0 (none exist) | Design fact |
| One-time base-song production | **₹229** for 10 languages: 10 x 20 attempts x $0.012 (ACE-Step v1 on fal, 60 s) | Estimate; excludes human review time and any musician fees |
| Asset delivery (if downloaded per language) | ₹0.0049 per user through a paid CDN without any free tier (0.47 MB x $0.109/GB); ₹0 inside the app bundle or on a zero-egress store | Estimate |
| Storage of base songs | Negligible (about 5 MB total); R2 is $0.015 per GB-month | Estimate |
| Failed generations | A failed render costs no money; the user is told and records again | Design fact |
| Retries | No provider calls, so no retry charges; battery cost not measured | Design fact |

## 4. Totals at 1,000, 10,000 and 100,000 successful songs (INR)

B total = ₹229 one-time + ₹0.0049 x n. Other rows are `per-song cost x n`.

| Successful songs | **B (chosen)** total / per song | A1 Mureka | A2 BlueMetal (best) | A2b BlueMetal (2 per song) | A3 Lyria | A4 ACE-Step on fal |
|---|---|---|---|---|---|---|
| 1,000 | **₹233 / ₹0.23** | ₹4,762 | ₹905 | ₹1,810 | ₹8,467 | ₹1,270 |
| 10,000 | **₹277 / ₹0.028** | ₹47,625 | ₹9,049 | ₹18,098 | ₹84,667 | ₹12,700 |
| 100,000 | **₹717 / ₹0.007** | ₹476,250 | ₹90,488 | ₹180,975 | ₹846,667 | ₹127,000 |

B's per-song figure falls as users grow because the only large cost is fixed. At 1,000 songs it is dominated by the one-time ₹229 and is still under ₹1.

## 5. What happens if provider prices change

| Scenario | Effect |
|---|---|
| BlueMetal x2 ($0.019) | ₹1.81 per song: over budget even in the best case |
| BlueMetal x0.5 | ₹0.45 |
| BlueMetal price at which one song costs exactly ₹1 | $0.0105 (only 10.5% above today's advertised price) |
| Mureka v8 x2 | ₹9.52 |
| Mureka would need to be about 4.8x cheaper to reach ₹1 including retries | Required price about $0.0095 |
| ACE-Step price on fal x5 | Base-song production rises from ₹229 to about ₹1,150 one-time; **B's per-user cost is unchanged** |
| Provider disappears or closes signups (MiniMax already did) | A: the product stops or must be re-platformed. B: base songs already produced keep working forever |

**Conclusion.** Under approach A every verified route is either over ₹1 or unsafe for names, and BlueMetal's margin to ₹1 is 10%. B's per-user cost does not depend on any provider price; provider pricing only affects a one-time production cost of a few hundred rupees.

## 6. What is still uncertain

- Every hosted price is **advertised**; none was tested with a paid call. Testing needs your approval (about $0.045 for one Mureka-with-lyrics song, or $0.10 of free BlueMetal credit that needs an account).
- Base-song **quality in Indian languages** for any hosted or open model is unknown. If a human musician is used instead, the one-time cost is not ₹229; that is a quote to obtain.
- Taxes (GST), payment fees and currency conversion on provider billing were not found.
- B's battery and thermal cost on real low-end phones is **not measured** (see [performance-test-plan.md](performance-test-plan.md)).
