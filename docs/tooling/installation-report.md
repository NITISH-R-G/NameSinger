# NameSinger: developer tooling, security review and accessibility report

- **Date:** 2026-11-06
- **Project:** `C:\Projects\Name singer\name-singer` (Expo SDK 58, React Native 0.88, TypeScript)
- **Nothing was committed, pushed, deployed or published.** The Git working tree is still uncommitted (as before this checkpoint).

**Legend.** Verified = I ran it or read it in this session. Not verified = could not be tested here. No physical device, emulator or iOS build was used for anything in this report.

## 1. Tools successfully installed

| Tool | Result | Notes |
|---|---|---|
| Cloudflare `security-audit` skill | Installed and discovered | Claude Code listed it as an available skill immediately after copying. Used for a full audit (section 5) |
| Alibaba Open Code Review (`ocr`) | Installed; local features verified | Delegation mode and Git diff selection work. The LLM review mode is **not** usable here (no credentials, section 2) |
| Open Design | Installed and launched | UI and daemon start and serve on loopback. The Claude Code integration and prototype generation are **not verified** (section 6) |

## 2. Tools not installed, or only partly usable, and why

| Item | Status | Reason |
|---|---|---|
| Coder | **Not installed (by design)** | You asked for assessment only: it is a server platform, not an editor plugin. Assessment and recommendation are in section 10 |
| OCR direct LLM review (`ocr review`, `ocr scan`) | **Blocked** | Needs an LLM provider key. No key variable (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) exists in this environment (only `ANTHROPIC_BASE_URL` is set, with no key). I did not use `ocr auth` (Sign in with ChatGPT) or enter any credential. See section 5.2 for what was done instead |
| Open Design: Claude Code integration | **Blocked** | The standalone `claude` CLI is not on `PATH` and was not found under `AppData`. The app detected only "Codex CLI 0.160.0" and a "BYOK OpenCode" entry. Using Codex would send prompts to OpenAI under your credentials, which you did not ask for, so I stopped |
| Open Design: prototype generation | **Not performed** | Same blocker. The "Free Credits" path requires creating an account or logging in, which I do not do |
| Official audit validators (`validate-findings.cjs`, `validate-coverage-ledger.cjs`) | **Not run** | Both fail closed on native Windows ("OS no-follow and nonblocking input protection is unavailable"; the findings validator's own test suite shows 7 failures here for the same reason). Docker Desktop is installed but its daemon was not running and I did not start it. I did not weaken the validators |
| Skills CLI (`npx skills add ...`) | **Not used** | I copied the audited files from the pinned commit instead (same files, no extra unreviewed CLI) |
| Docker, WSL | **Not changed** | Not started or configured |

## 3. Exact versions and installation locations

| Item | Version / source | Location |
|---|---|---|
| security-audit skill | `cloudflare/security-audit-skill` commit `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8` (2026-09-14), MIT | `C:\Users\nitis\.claude\skills\security-audit\` (21 files; provenance in `INSTALLED-FROM.txt`) |
| Open Code Review | npm `@alibaba-group/open-code-review@1.13.6`, binary `windows/amd64` build 2026-11-05 (commit `891df1b`), Apache-2.0 | `C:\Users\nitis\AppData\Roaming\npm\` (`ocr`), global npm package |
| Open Design | `nexu-io/open-design` commit `87a4f91c308170a8270458fc40fc66a86ed69aac` (2026-11-06), package version 0.25.1, Apache-2.0 | `C:\Projects\Name singer\tools\open-design\` (a separate folder beside, not inside, `name-singer`) |
| Open Design runtime | Node v24.18.0 (repo needs `~24`); pnpm **10.33.2 via Corepack** (the repo needs `>=10.33.2 <11`; your global pnpm 11.25.0 is out of range and was not changed) | Corepack cache; `corepack enable` was **not** run |
| Install log | | `C:\Projects\Name singer\tools\open-design-install.log`, `open-design-run.log` |
| Audit output | quick profile run-1 | `C:\Users\nitis\security-audit-skill\name-singer\run-1\` (outside the repository) |

Inspection before installing: I shallow-cloned each repository into a scratch folder and read the files that would run. The skill's two validators use only `fs`; the OCR npm package's postinstall (`scripts/install.js`) only downloads over HTTPS and checks a SHA-256 when no platform package is present (on Windows the `win32-x64` package supplied the binary); Open Design's `postinstall.mjs` builds local workspace packages through pnpm. Open Design's dependency build-script allowlist (`pnpm-workspace.yaml`) includes `electron`, `sharp`, `better-sqlite3`, `onnxruntime-node`, `esbuild`, `protobufjs`, `core-js` and `electron-winstaller`, which download or build native binaries. `corepack pnpm install --frozen-lockfile` finished with exit code 0 in 9 minutes.

## 4. Commands used

```bash
# inspection (read-only)
git clone --depth 1 <repo> <scratch>/inspect/<name>
grep / cat on the files above

# 1. Cloudflare skill (manual copy from the inspected commit)
mkdir -p ~/.claude/skills/security-audit && cp -r <clone>/skills/security-audit/. ~/.claude/skills/security-audit/
node ~/.claude/skills/security-audit/validate-coverage-ledger.test.cjs   # 24 pass, 7 skipped
node ~/.claude/skills/security-audit/validate-findings.test.cjs          # 22 pass, 7 fail (Windows), 5 skipped

# 2. Open Code Review
npm install -g @alibaba-group/open-code-review@1.13.6
OCR_NO_UPDATE=1 ocr version
OCR_NO_UPDATE=1 ocr delegate preview                     # workspace mode
OCR_NO_UPDATE=1 ocr delegate preview --commit 0c28aba    # commit mode
OCR_NO_UPDATE=1 ocr delegate rule <files>                # resolved review rules

# 4. Open Design (separate folder)
mkdir tools/open-design && cd tools/open-design && git init && git remote add origin <repo>
git fetch --depth 1 origin 87a4f91c308170a8270458fc40fc66a86ed69aac && git checkout FETCH_HEAD
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm install --frozen-lockfile
corepack pnpm tools-dev run web        # started; later: corepack pnpm tools-dev stop

# 5. NameSinger checks
npx tsc --noEmit; npx jest; npx expo install --check; npx expo-doctor; npm audit
npx expo export --platform android --output-dir <temp>   # bundle check, output deleted
```

## 5. Security review findings

### 5.1 Cloudflare security-audit skill (full audit, quick profile)

Full detail: `C:\Users\nitis\security-audit-skill\name-singer\run-1\REPORT.md`.

- **Scope and limits:** `quick` profile (partial by definition), **static source review only** (no OS sandbox exists on this host, so no target code was executed). 8 agents: 4 reconnaissance, 3 hunters, 1 final coverage critic; no candidate reached validation, so no verifier ran. Independent validation was applied to coverage (the critic re-read code) but there were no candidates to validate.
- **Result:** **0 confirmed vulnerabilities and 0 `needs_validation` leads.** 11 hardening notes. 6 units covered; **5 units deferred** by the profile (web target, generated native permissions, sweep versus the demo player, test integrity, accessibility-service exposure) and therefore **not reviewed**. This is not a clean-bill claim.
- **False positives / rejected leads:** deep-link abuse (inert, one route, no params); arbitrary file deletion (no lower-trust input reaches the delete sink); raw error text in the UI (self-impact only); tracked `.claude/settings.json` (template content, official marketplace only); untracked lockfile (reproducibility gap, no confusion vector). All were classified hardening, not vulnerabilities.
- **Most important hardening items (all addressed or listed below):**
  1. Consent text promised cleanup "when the app is next opened" but the sweep only runs before the next recording. **Fixed** (consent text and warning text).
  2. Stale documentation claims (`console.*`, "stores nothing persistently", lockfile). **Fixed** in `security.md`, `threat-model.md`, `data-retention.md`.
  3. Raw native `error.message` shown in the UI. **Fixed** (fixed messages only, section 7).
  4. Untracked `package-lock.json`. **Open** (commit it; install with `npm ci`).
  5. 10 s cap is a client poll, no `forDuration`; `inactive` AppState; no path containment check in `deleteRecordingFile`. **Open** (hardening, low risk).
- **Validators:** not run (section 2). `findings.json` is an empty array; re-run both validators on Linux/WSL before relying on the structured output.
- **Deviation from the skill:** hunters were pointed at the skill's attack-class files instead of receiving the blocks pasted verbatim.
- **Application files:** the skill did not modify any. I changed the application afterwards, only after reviewing its findings.

### 5.2 Open Code Review

- **Platform:** native Windows is supported (`windows/amd64` binary, `install.ps1`, README badge); WSL is not required. Requires Git >= 2.41 (this machine has 2.53.0).
- **Install method:** the official recommended `npm install -g` at the pinned version; npm skipped the package's postinstall under the project's allowScripts policy and the binary still ran (provided by the platform package).
- **Data transmitted (from source and README):** in **direct mode** the CLI sends changed-file contents and agent tool results (file reads, searches) to whichever LLM endpoint you configure. The Go source lists these provider hosts: Anthropic, OpenAI, DeepSeek, Google Gemini (OpenAI-compatible endpoint), Alibaba DashScope, Moonshot, Mistral, xAI, MiniMax, SiliconFlow, Volcano Ark, Novita, EdenAI, Tencent LKEAP, Xiaomi, Ollama, plus custom gateways, and a "Sign in with ChatGPT" flow. In **delegation mode** OCR only selects files and resolves rules locally; the review is done by the host agent. Telemetry is **off by default** (needs `OCR_ENABLE_TELEMETRY`). **A background self-update check runs unless `OCR_NO_UPDATE` is set** (it can run `npm i -g`); I set `OCR_NO_UPDATE=1` on every command. Set it permanently if you want a pinned version.
- **Credentials:** none configured and none written anywhere. Nothing was added to the repo or Git.
- **Verified locally:** workspace mode (22 of 37 changed files reviewable, with reasons for each exclusion: deleted, binary, default test path, unsupported extension, lockfile) and single-commit mode. Branch-range mode (`--from/--to`) is documented but was not exercised because the repository has one commit.
- **Review performed:** delegation mode. A subagent in this session reviewed the 22 selected files against OCR's resolved rules. No source code was sent to any new external service. **This is not the same as OCR's own LLM pipeline** (its precision benchmarks do not apply to this run). Result: 20 items, none high severity, none in the security category.
  - Fixed now: demo track playable while recording (mic bleed), start/dispose and start/background races in `start()`, give-up warning cleared by later flushes, recording mode left on after a failed start, nested ternary in `NameRecorder`, unhandled `Linking.openSettings()` rejection, demo-script comment and missing `mkdir`, misleading `recorderState` comment, plus the timer live region (also an accessibility defect).
  - Not changed (decisions for you): remove unused `@tanstack/react-query` (kept, you asked for it); set `playsInSilentMode` at startup (iOS silent-switch behavior, needs a device to judge); dead `CONSENT_NOTICE_VERSION`, `primaryPressed` token, `pendingCount`, `getLanguage` (kept: documented or test seams); duplicate `.gitignore` entries and the `.npmrc` ignore rule; add `ios.bundleIdentifier` / `android.package` before the first EAS build.

## 6. Open Design launch and prototype verification

- **Verified:** installed from the pinned commit with a frozen lockfile (exit 0). `tools-dev run web` started the daemon (`127.0.0.1:53431`) and web UI (`127.0.0.1:53432`), **bound to loopback only**. The UI loaded and showed the onboarding screen. The "Local AI" tab detected **Codex CLI 0.160.0** and **BYOK OpenCode**; Claude Code was **not** detected. I then ran `tools-dev stop`; both processes stopped and the ports closed.
- **Not verified:** the Claude Code integration, generating a prototype, and exploring NameSinger onboarding, recording, language selection and song-generation screens. No prototype was generated. I did not use the hosted "Free Credits" path (account creation) or Codex.
- **Isolation:** Open Design lives in `C:\Projects\Name singer\tools\open-design` with its own `node_modules` and pinned pnpm; it did not touch `name-singer`'s `package.json`, lockfile or `node_modules` (`name-singer`'s Git status is unchanged by it).
- **To finish (manual):** install and sign in to the Claude Code CLI so `claude` is on `PATH` (then use Rescan in Open Design), **or** configure a BYOK runtime with your own key, then start it with `corepack pnpm tools-dev run web` from the Open Design folder. Open Design's documented Windows notes are in its `docs/windows-troubleshooting.md`. Check its `PRIVACY.md` before sending prompts: a hosted or BYOK runtime sends your prompt text to that provider.

## 7. Accessibility audit findings

**Important caveats.** (a) You referred to "the reference video"; **no video was provided to me**, so I applied standard React Native accessibility guidance verified against the installed React Native 0.88 type definitions (roles `button`, `radio`, `radiogroup`, `header`, `alert`; state keys `disabled`, `busy`, `checked`, `selected`; `AccessibilityInfo.announceForAccessibility`). If the video makes specific points, send them and I will check against them. (b) **Nothing was tested with TalkBack, VoiceOver, a hardware keyboard, Switch Access or on a device.** (c) **I did not test, and do not claim, that an AI agent can drive the app through its accessibility tree.** (d) The project has no React test renderer, so components are not rendered in tests; verification is by pure-function tests plus a static scan of the source.

| Area | Finding (before) | Change made | Verification |
|---|---|---|---|
| All buttons (`ActionButton`) | Already a real `Pressable` with role, label, hint, disabled state, 48 dp minimum height | Now built from a tested helper (`buttonA11y`), adds `busy` state; `disabled`/`busy` genuinely disable the `Pressable` | Unit tests; static test that `Pressable` appears only in `ActionButton` and `LanguageSelector` |
| Language selection | Real `Pressable` radios in a `radiogroup`; label combined English and native name, which screen readers may mispronounce | Spoken label is the English name; native name stays visible; group has label "Language"; `selected` and `checked` state kept; 56 dp targets | Unit test for all 10 languages |
| Recording controls | Timer text had a live region that would re-announce about 5 times a second; iOS has no live regions, so state changes were silent there | Removed the live region; timer has a static label ("Recording time 0:03"); phase changes are announced with `announceForAccessibility` (recording started, saved, approved, mic off, errors); Record button is `busy` (not just disabled) while permission or saving is in progress and says why when disabled | Unit tests for announcements; static test forbids `accessibilityLiveRegion` |
| Playback controls | Time label read "Length 0:03" for a position/length pair; no loading feedback; raw native error text (could contain a file path) shown and announced; demo track playable while recording | Label now "Position 0:01 of 0:03"; visible "Loading audio…" with `busy`; fixed error message with `alert` role and an explicit announcement; playback disabled while the microphone is active | Unit tests; static test forbids rendering `error.message`; controller tests for fixed error text |
| Consent actions | Buttons were real; declined message used an Android-only live region | Declined message uses `alert` role; wording corrected to match behaviour | Consent wording tests |
| Navigation | Single screen; section titles and brand already `header` | "STEP n" labels hidden from assistive technology (they only duplicate the headings) | Static test requires header roles |
| Error and permission states | Live regions (Android-only) | `alert` roles plus explicit announcements; cleanup warning also an `alert` | Static test |
| Disabled "Generate song" | Disabled, no explanation | Hint "Not available yet"; genuinely disabled | Unit test of button state |
| Touch targets | 48 dp buttons, 56 dp language chips | Unchanged; test requires the shared minimum of 48 | Unit test |
| Colour contrast | Not previously measured | Added a WCAG contrast calculator and a test for 15 foreground/background pairs actually used by the theme; **all are at least 4.5:1** | Tests pass. Disabled-button colours are intentionally exempt |
| No clickable decorative Views | Confirmed: no `onPress` on `View`, `Text` or `Image`; no roles added to make a decorative View look interactive | Enforced by a static test | Tests pass |

**Not checked / open:** focus order and focus visibility with an external keyboard (React Native `Pressable` is focusable by default, not tested); dynamic text size at the largest settings; reduce-motion (the only animation is a small press scale); behaviour of `announceForAccessibility` when a screen reader is off or on specific OS versions; that VoiceOver or TalkBack reads the `radiogroup` and `radio` roles as intended on real devices.

## 8. New dependencies and configuration changes

- **New dependencies installed into `name-singer`: none** in this checkpoint (the earlier `react-dom` pin and Jest packages are from earlier checkpoints). `@types/node` was already present through Jest.
- **Configuration:** `tsconfig.json` `types` now `["jest", "node"]` (needed by the static-scan test; no install).
- **Machine-level changes:** global npm package `@alibaba-group/open-code-review@1.13.6`; new folder `~/.claude/skills/security-audit`; new folder `C:\Projects\Name singer\tools\` (Open Design and its logs); Corepack cache for pnpm 10.33.2; pnpm package store entries; audit output under `C:\Users\nitis\security-audit-skill\`. No PATH, registry, Docker, WSL, Windows feature or Corepack-shim changes.
- **Application source changed after the audit and review:** `src/utils/accessibility.ts` (new), `ActionButton`, `LanguageSelector`, `AudioPreview`, `NameRecorder`, `ConsentNotice`, `src/app/index.tsx`, `src/hooks/recordingController.ts`, `src/hooks/recorderState.ts` (comment), `src/hooks/recordingCleanup.ts` (warning text), `src/constants/consent.ts` (wording), `scripts/generate-demo-instrumental.js`; tests `accessibility.test.ts` and `recordingControllerRaces.test.ts` (new); docs `security.md`, `threat-model.md`, `data-retention.md`.
- **Checks after the changes (all run):** `npx tsc --noEmit` clean; `npx jest` 7 suites, 127 tests, all pass; `npx expo install --check` up to date; `npx expo-doctor` 20 of 20; Android bundle export builds; `npm audit` still reports the same 24 tooling findings (1 low, 23 moderate; 5 in the production dependency tree), none changed.

## 9. Remaining manual steps

1. Commit `package-lock.json` and the Checkpoint work (nothing is committed).
2. Run the audit validators on Linux, WSL or a started Docker Desktop: `node validate-coverage-ledger.cjs` and `validate-findings.cjs` against `run-1`.
3. Decide whether to run a deeper audit (`deep` profile) covering the 5 deferred units, ideally after the device checklist in `docs/security/data-retention.md`.
4. Test the app on real devices with TalkBack and VoiceOver (and a hardware keyboard) before claiming accessibility conformance.
5. For OCR LLM mode: choose a provider, put its key in an environment variable or OCR's own config outside Git, and decide what code may be sent to it. Consider `setx OCR_NO_UPDATE 1` to keep the version pinned.
6. For Open Design: install and sign in to the Claude Code CLI (or configure a BYOK key), then re-run the launch and generate the NameSinger prototypes.
7. Decide on the open hardening items (section 5.1 and 5.2), including a native `forDuration` bound, an `inactive` AppState policy, a delete containment check, `playsInSilentMode`, and bundle identifiers.

## 10. Risks and recommendations

- **Tool trust:** the Cloudflare skill and OCR run with your privileges. I inspected the skill's code and OCR's installer and update logic, not every line of OCR's Go source. OCR's background auto-update (`npm i -g`) is a supply-chain path; keep `OCR_NO_UPDATE` set.
- **Data flow:** only direct-mode OCR and a hosted or BYOK Open Design runtime send code or prompts to a third party. Neither was used.
- **Audit confidence:** partial, static, zero-finding result from a `quick` profile; 5 deferred units; validators not run. Treat it as one input, not assurance.
- **Open Design:** it is a large dev server (Electron, native modules, many dependencies) with an untested agent integration. It is isolated, loopback-only and stopped. Keep it out of `name-singer`.
- **Accessibility:** code and tests improved and verified statically; real assistive-technology behaviour is unverified.
- **Coder (assessment from its README, `SECURITY.md`, install, agent-architecture and security docs):**
  - *What it is:* a self-hosted control plane (Go server plus PostgreSQL) that provisions cloud development environments from Terraform templates (Docker containers, Kubernetes pods, VMs), with a workspace agent that dials out over a WireGuard-based tunnel (DERP relay or peer-to-peer). "Coder Agents" runs the AI agent loop in the control plane.
  - *Requirements:* Linux or macOS via an install script; Windows via an installer or `winget`, with the Visual C++ runtime for the built-in database. Docker or Kubernetes (or cloud accounts) for workspaces. The quickstart suggests a separate machine or VM, not your main dev machine. On Windows, Docker Desktop with WSL2 would be the practical route; your Docker Desktop is installed but was not running.
  - *Security model (documented):* workspaces need no inbound ports; the agent's tool calls travel the same tunnel as IDE and SSH connections; LLM provider credentials live only in the control plane (none in workspaces); the agent can only use workspaces owned by the user who started the chat; secrets are injected per user or workspace; provisioners hold powerful cloud credentials and should be scoped and isolated; admins should treat the control plane as a high-value target. The isolation strength depends on the template (container, VM or pod) and your configuration; I did not test any of it.
  - *Licence:* AGPL-3.0, with some enterprise-licensed parts.
  - *Fit for you:* **low today.** You are a single developer on Windows building a React Native app that needs Android emulators, a phone and Expo tooling, which are awkward inside remote containers. Coder adds a server, a database, templates and upgrades to maintain.
  - *Recommendation:* **do not adopt now.** Revisit if you add collaborators, need reproducible environments, or want to run autonomous agents on untrusted code with scoped credentials. If you try it, use a throw-away Linux VM or WSL2 distro rather than your main Windows install, and start with the Docker template.
- **Next recommended actions:** commit and lock dependencies; run the device checklist; re-run the audit validators and a `deep` audit; then do the Open Design step once an agent runtime is available.
