# Real-voice validation protocol

Purpose: decide, from real people on real phones, whether the recording check (`src/audio/recordingQuality.ts`, thresholds in `docs/ux/recording-validation.md`) rejects takes it should accept, or accepts takes it should reject.

**Status: a plan. No real-voice measurements exist yet.** The current thresholds were justified only with synthetic speech and synthetic noise (see `recording-validation.md`). **Do not change any threshold until this protocol has produced evidence** (see "Decision rule").

## What counts as what

- **Observation**: something a person saw, heard or the app displayed during a session, written on the sheet at the time.
- **Measurement**: a number produced by an instrument (a sound-level meter app or a script on a consented file).
- **Assumption**: anything else. Each assumption below is labelled and is a hypothesis to test, not a result.

## Assumptions to test (hypotheses, not findings)

| ID | Assumption | Where it comes from |
|---|---|---|
| A1 | A natural speaking voice 20 to 30 cm from a phone mic peaks well above -30 dBFS | General expectation. Not measured here |
| A2 | A quiet or distant voice (more than 60 cm) sometimes falls below the -62 dBFS floor or the 12 dB margin | Synthetic result only |
| A3 | Ordinary home background noise leaves enough margin for the 12 dB rule | Synthetic result only |
| A4 | Breath, a click or a tap is refused, while a soft breath of 150 to 300 ms may be accepted | Synthetic result only. Breath-like bursts were accepted in testing |
| A5 | Background speech (a TV, another person) is not distinguishable from the name by this check | Reasoned from how the detector works (energy only). Not tested |
| A6 | Voices and styles differ (pitch, accent, whisper, fast or slow speech) without changing acceptance | Untested. Tests used two synthetic voices |
| A7 | The "quiet" note (voiced level below -48 dBFS) appears when a take really is too faint in the song | Reasoned from the 24 dB boost cap. Not listened to on real names |

## Ethics and data handling

- Participants are adults who give informed consent in writing before any session. The form says what is captured, why, who sees it, how long it is kept, and that they may stop at any time and have their data removed.
- **Default (Tier A): no voice is retained.** The moderator records only the app's verdict and their own notes. The app already deletes recordings on re-record, reset and exit. Say the name aloud, not a real private name, if the participant prefers: **an alias or nickname is fine**.
- **Tier B (optional, only with separate explicit written consent for retention):** saving a participant's take for offline analysis. The current app has no export. Expo Go on an unrooted device cannot hand over cache files, so Tier B needs a decision on a purpose-built way to capture files, which is outside this task. Until then Tier B does not happen. If it is built: store files in an access-controlled location, label with a participant code (never the name), keep only until analysis is complete and no longer than the period on the consent form, then delete and log the deletion.
- Do not record video or audio of the sessions unless the consent form separately says so.
- Children are excluded. No one is paid in a way that makes refusing hard.

## Equipment

- At least two physical Android phones, one low-end (about 2 GB RAM) and one mid-range, with the app installed the same way participants will get it. Record model, Android version and build for each.
- A sound-level meter (a phone app is acceptable if its limits are written down) to measure room noise in dB(A) and the participant's speaking level at the phone, noted as such. These are **estimates**, not calibrated measurements, unless a calibrated meter is used.
- A tape measure for distance. A timer.
- The observation sheet below (one per take).

## Conditions

Run each participant through the conditions below, in a randomised order, one name per take. Record the app's verdict for every take.

| Factor | Levels |
|---|---|
| Speaking volume | Quiet (as if in a library), natural, loud/projected |
| Distance (mouth to mic) | 10 cm, 30 cm, 60 cm, 1 m |
| Environment | Quiet room; moderate (fan, light traffic outside, kitchen); noisy (busy cafe or TV and conversation) |
| Voice / style | Participant's normal voice; fast; slow and drawn out; whisper; a second name in the participant's mother tongue |
| Interference | Background speech (a second person talking, or a TV at conversation level); breathing before and after the name; a click or tap near the phone; deliberate silence (tap record and say nothing) |

Not every combination is required. A minimum set per participant: natural volume at 30 cm in quiet, moderate and noisy rooms; quiet and loud at 30 cm in the quiet room; natural at 10 cm, 60 cm and 1 m in the quiet room; one whisper; one with background speech; one silence; one with a click. That is 13 takes. Participants should be told they may skip any take.

Aim for at least 10 different voices (a mix of ages, pitches, accents, and first languages) before drawing any conclusion about thresholds. Fewer is a pilot and must be labelled as one.

## Observation sheet (one row per take)

| Field | How it is filled |
|---|---|
| Participant code (never the name), device, Android version | Written |
| Condition (volume, distance, environment, style, interference) | As run |
| Room noise, dB(A) (instrument and method) | Measured, or "not measured" |
| Speaking level at the phone, dB(A) | Measured, or "not measured" |
| What the participant said (as an alias) | Optional |
| **App verdict** | Accepted / Accepted with "quiet" note / Refused: silent / Refused: unclear / Refused: too short |
| **Moderator's judgement** of the take: was it a clear name a person could understand when played back? | Yes / No / Unsure (listen once; do not keep audio in Tier A) |
| Match? | Verdict agrees with judgement: yes / no |
| If accepted: did the finished song let you hear the name? | Yes / Faint / No (listen to the song) |
| Anything unexpected | Free text |

Count a **false rejection** when the app refuses a take the moderator judged clear. Count a **false acceptance** when the app accepts a take the moderator judged unusable (silent, buried in noise, no name). Record "unsure" separately; do not force it into either.

## Analysis

- Report counts by condition, not only totals: false rejections, false acceptances, quiet-note takes, and takes where an accepted song had a faint or inaudible name.
- Report how many different participants contributed to each cell. With few participants, say so; do not present percentages from small counts as rates.
- Keep observations and measurements in separate columns from any interpretation.
- Note device effects: if one phone microphone behaves differently, report it per device.

## Decision rule

A threshold may be changed only if all hold:
1. The evidence comes from real voices on physical devices, from at least 10 participants (or the report says it is a pilot and no change is made).
2. The false rejections (or false acceptances) occur for more than one participant and more than one device, and are not explained by an obviously bad take.
3. The proposed change is tested against the same sheet again, and the synthetic tests in `__tests__/recordingQuality.test.ts` are updated with a documented reason.
4. The change and its evidence are recorded in `recording-validation.md`.

Otherwise leave the thresholds as they are and record why.

## What this protocol cannot answer

- Whether people understand the refusal messages (the usability test covers that: `usability-test-plan.md`).
- How the rate of unusable takes behaves in the wild. That would need analytics, which do not exist and need an approved destination and privacy design.
- Any claim about conversion or retention.
