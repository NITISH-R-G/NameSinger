# NameSinger moderated usability test plan

**Status: a plan. No sessions have been run and there are no participant results.** The onboarding design is frozen for this test: do not change the app between sessions. If something must change, stop, report the sessions already run, and start a new round.

## Goals

Find where first-time users hesitate, get stuck or are misled between opening the app and hearing their first personalized song. "Activation" means a user plays their first personalized song.

This test does **not** measure conversion, retention or business impact, and the results must not be reported as such. With 5 to 8 people it shows problems, not rates.

## Participants

- 5 to 8 adults who have never used NameSinger. Recruit a mix of ages, phone experience and first languages. At least two on a low-end Android phone, and at least one who is not comfortable with technology.
- Exclude people who work on the app and anyone who has seen it.
- Informed consent in writing before the session (see "Ethics").
- Record only: participant code (P1, P2, …), age band, phone model and Android version, first language, self-rated phone confidence (1 to 5).

## Setup

- A physical Android phone per session, the same build for everyone, **fresh install or cleared app data** so the welcome screen, consent and microphone permission all appear as for a new user. Note which: a participant who has previously granted microphone to the host app (for example Expo Go) is not a first-time permission experience. Record this.
- Phone volume at a comfortable mid level; headphones off. Sound on, Do Not Disturb on.
- A quiet room for most sessions. Note the room (quiet, moderate, noisy).
- Note whether the build is Expo Go (shows the Expo overlay and a different permission dialog name) or a development/production build. Findings may differ between them.
- Moderator, plus a silent note-taker if possible. A timer.
- No screen or voice recording unless the consent form separately says so. The app deletes the participant's voice recording as designed; nothing about their voice is retained by the test.

## Ethics

- The participant says their name, which is personal data. They may use an **alias or nickname** and must be told so.
- They may skip any task or stop at any time without giving a reason.
- Say that the app is being tested, not them.
- Keep notes under participant codes only. Store them where only the team can reach them and delete on the date on the consent form.
- If something fails because of the app (for example a refused recording), say it is the app's behavior and not their fault.

## Tasks

Read each task aloud and **do not explain the interface or answer how-to questions**. If they ask, say "What would you do if I weren't here?" Offer help only under the assistance rules.

| # | Task as given to the participant |
|---|---|
| 1 | "Open NameSinger. Take a moment to look, and tell me what you think it does." |
| 2 | "Find the sample and play it." |
| 3 | "Start creating a song with your name." |
| 4 | "Your phone may ask you something. Tell me what you think it is asking, and respond as you normally would." |
| 5 | "Record your name, then listen to your recording and decide what to do with it." |
| 6 | "Get your song and play it." |
| 7 | "Tell me what you think the language setting changes right now." |

Expected observations (for the moderator only, never said aloud): task 1, a way to hear a song with your name; task 7, **nothing yet** (the screen says so). Treat any answer that expects a different language or voice in the song as a misunderstanding to record.

Task 4: the moderator should not tap for them. If the participant denies the permission, let it run: it tests the recovery flow. Do not re-grant it until after the task is finished.

## Assistance rules

Count every assist. Levels:

| Level | Meaning | Example |
|---|---|---|
| 0 | None | Participant does it alone |
| 1 | Nudge | "Take another look at the screen" |
| 2 | Hint | "Is there anything you can scroll to?" |
| 3 | Direct help | Moderator points to or says the control |
| F | Failure | Task not completed, or the moderator completes it |

Wait at least 30 seconds of silence before a level 1 nudge unless the participant is clearly distressed. A task is **completed unassisted** only at level 0. **Completed with assistance** is levels 1 to 3. **Not completed** is F.

## Measures and exact definitions

| Measure | Definition |
|---|---|
| Task completion rate | For each task: number of participants completed unassisted / completed with assistance / not completed, out of participants who attempted it. Report the counts, not only a percentage |
| Time to first song playback | Seconds from the moment the app is first on screen with the welcome screen to the song audibly playing. Stopwatch. Report each participant's time and the median; also report time excluding any pause the moderator caused. Include only participants who reached it |
| Recording failure rate | Takes that ended in a refusal (silent, unclear, too short) or an error, divided by all takes attempted. Report counts. Distinguish refusals the moderator judged **correct** (a silent take) from those judged **wrong** (a clear name was refused) |
| Permission-related failures | Participants who denied, were blocked, got stuck, or did not understand the microphone request; and, for each, whether they recovered without help |
| Assistance count | Total and per task, by level |
| Confusion or hesitation | At each step: pauses of 5 seconds or more, wrong taps, backtracking, spoken confusion, and the exact words used. Record the moment and the screen |

## Moderator script

**Introduction (read aloud):**
"Thank you for helping. I'm testing an app called NameSinger, not you. There are no right or wrong answers, and you can stop at any time. I'll ask you to do a few things and I won't be able to help much, because I want to see what's confusing in the app. Please think aloud: say what you're looking at, what you expect, and what surprises you. The app may use your voice to say your name. You may use a nickname instead of your real name. The recording stays on the phone and is deleted by the app, and I'm not keeping any recording of you. Do you have any questions? Do you agree to take part?" (Take written consent. Answer questions.)

**Pre-task questions (2 minutes):** phone model confidence (1 to 5); "Have you used apps that make songs or voices personal?"; "How do you feel about apps that ask to use your microphone?"

**During:** read each task. Prompts allowed: "What are you thinking?", "What did you expect to happen?", "What would you do next?" Do not lead, do not confirm they are right, do not describe the screen.

**After each task:** "How easy or difficult was that, from 1 (very difficult) to 5 (very easy)?" Write the number.

**Closing:** thank them, explain how the notes are used, tell them the date their notes will be deleted, offer to answer questions once the session is over. Reveal what language does only after task 7 is done, if they ask.

## Observation sheet

One copy per participant.

Header: participant code · date · device and Android version · build type (Expo Go / dev / production) · first install or cleared data (Y/N) · room · moderator.

| Task / step | Completed (unassisted / assisted / failed) | Assist level and what was said | Time (s) | Hesitations (≥5 s) and wrong taps | Participant's words | Ease rating (1 to 5) | Notes: where on the screen |
|---|---|---|---|---|---|---|---|
| 1 What does it do | | | | | | | |
| 2 Find and play the sample | | | | | | | |
| 3 Start creating | | | | | | | |
| 4 Microphone request (what they understood, what they chose) | | | | | | | |
| 4b If denied or blocked: did they recover alone? | | | | | | | |
| 5a Record | | | | | | | |
| 5b Review and decide | | | | | | | |
| 6a Song generated | | | | | | | |
| 6b Song played (time to this point from welcome: ___ s) | | | | | | | |
| 7 What language changes | | | | | | | |

Takes log (one row per take):

| Take # | Participant said (alias) | Distance / manner | App verdict | Moderator judgement of the take | Match? | What the participant did next |
|---|---|---|---|---|---|---|

Hesitation log (free):

| Time | Screen | What happened | Words used |
|---|---|---|---|

Also note the **first thing** the participant did on the welcome screen, whether they scrolled, whether the sample played by accident, and whether they read the consent text or opened "More details".

## Post-test questions

1. In your own words, what does NameSinger do?
2. What was the clearest part? What was the most confusing part?
3. When your phone asked about the microphone, what did you think it was asking? Did you know why?
4. Did you feel in control of what happened to your voice? What do you believe happened to your recording?
5. What did the language setting do? What did you expect it to do?
6. How did you feel when you waited for your song? Did you know what was happening?
7. Was anything refused or did anything go wrong? How did you feel about the message?
8. How much would you trust this app with your voice, 1 to 5, and why?
9. What would you change first?
10. Would you try it with someone else's name or share the song? (Opinion only; this is not a measure of future behavior.)

Optional: the 10 System Usability Scale statements, scored per the standard method, **reported only as a descriptive number for this small group** and not compared to any benchmark.

## Analysis

1. Fill the measures table with counts per task and step. Show each participant's own result so no one person is hidden in an average.
2. List issues. For each issue record: the step, number of participants affected (of N), severity, and the evidence (quote or observed behavior). Suggested severity: **Blocker** (task failed or needed level 3 help), **Major** (needed level 1 to 2 or long hesitation), **Minor** (a pause or comment).
3. Mark which participants and devices were involved. Do not generalize beyond N.
4. Keep **observations** (what happened) separate from **interpretations** and **proposed fixes**, in different sections.
5. An issue is "confirmed for follow-up" if at least 2 participants hit it independently. An issue seen once is "noted".
6. Do not state a conversion, completion or retention improvement. Compare nothing to the earlier design, because no participants saw it.

## Reporting

A short report with: who took part (codes and bands), setup and build used, the filled measures table, the issue list, the unanswered questions, and what the test could not cover (no iOS, few devices, quiet-room bias, moderated and not natural use). Keep the raw sheets out of the repository unless every participant has agreed.

## Link to other plans

Recording-quality thresholds are validated separately with a different protocol and more participants: `real-voice-validation-protocol.md`. In this test, still record every take's verdict and the moderator's judgement of it; that is only a sanity check, not a threshold study.

## Known coverage gaps

Physical devices are required and have not been used. No screen-reader session is included; add one or two sessions with TalkBack users before relying on the accessibility behavior. The test is in English or the moderator's language; the app copy is English only.
