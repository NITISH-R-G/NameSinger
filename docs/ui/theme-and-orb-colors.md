# Theme unification and glass (implementation)

Design and the AndroidLiquidGlass decision: [liquid-glass-design.md](liquid-glass-design.md). This file says what exists and what each effect really is.

## 1. One colour identity from the orb

The selected orb palette is the application's accent identity. `buildPalette(scheme, orbTheme)` in `src/theme/buildTheme.ts` is the single place the palette is made; `ThemeProvider` calls it with the current scheme and the current orb, and `useTheme().colors` / `.glass` are the result. There is no separate purple theme left.

### Token architecture (`src/theme/colors.ts`)

| Family | Tokens | Source |
|---|---|---|
| Accent (from the orb) | `accent`, `accentStrong`, `accentSoft`, `accentMuted`, `accentForeground`, `onAccent`, `selection`, `focusRing` | `ORB_PALETTES[id].accent[scheme]` (deep on Light, luminous on Dark), then mixed |
| Glass colour (from the orb) | `glassTint`, `glassHighlight`, `glassBorder` | accent and orb highlight |
| Orb | `orbPrimary`, `orbSecondary`, `orbHighlight` | the orb palette's body colours |
| Neutrals | `ink` (primary text), `inkMuted` (secondary), `background`, `surface`, `surfaceElevated`, `surfaceMuted`, `border` (dividers), `field`, `placeholder`, `scrim`, `disabled`, `onDisabled`, `neutral*` | designed per scheme; only a faint lean toward the accent |
| Error | `danger`, `dangerPressed`, `dangerSurface`, `onDanger`, `success*` | fixed, never accent |
| Legacy aliases | `primary`, `primaryPressed`, `onPrimary` | the accent, so every old component follows it |

Body text stays neutral (never the accent). Glass rendering parameters (fill, rim, highlight, bounce, shadow, blur, blur tint) are `GlassTokens` from `buildGlass(scheme, orbTheme)`.

Every text-on-surface pair the app uses is contrast-tested for all 8 palettes in both schemes (16 combinations, WCAG AA); hue families are tested too (Aurora violet, Ocean blue and cyan, Sunset coral, Emerald green, Rose magenta, Glacier ice blue, Solar amber, Amethyst purple).

### Hard-coded colours removed

- The fixed violet identity: `#4B2E9F`, `#3A2380` (Light primary and pressed), `#BBA8FF`, `#A68FFF` (Dark primary and pressed), and the `#C2410C` accent.
- Fixed neutrals now derived from the scheme and orb: `#FBF6EE`, `#1E1B2E`, `#F1EEF8`, `#F4F0F5`, `#0D0B16`, `#17141F`, `#6B6678`, `#8A8499`, `#ECE8F3`.
- Fixed cobalt and magenta in the opening glass orb (`#2F7BFF`, `#25C7FF`, `#FF3D8B`, `#8E82B8`, `#B9AFD3`): now the orb palette's glow and cloud colours, and bases mixed with the accent.
- The old orb constants (`ORB_PALETTE` and per-cloud literals) are in `orbPalettes.ts` only.

A test fails if any of these literals reappears in a component, screen or provider, and if a component holds any colour literal at all (white for SVG highlights, and the neutral bases in `GlassOrb` that are mixed with the accent, excepted).

### Live propagation

A palette change updates the orb (the 0.9 s blend), the ambient scene behind it (the same blend), and every component through context in one render. A single accent wash (a translucent accent fading in and out, native-driven, 0.74 s) plays over the interface in step with the blend. Colours of text and controls change at once, not tweened frame by frame (that would re-render the tree every frame). Nothing is remounted: the conversation, recorder, speech and playback never read the theme (tested). The choice is saved; Light, Dark and System keep it, because the orb is an input to the palette, not part of the scheme.

## 2. Glass: what each effect really is

`GlassSurface` builds a pane in layers:

| Layer | What it is |
|---|---|
| Backdrop blur | **Actual native blur.** `expo-blur` `BlurView` (Android: one shared `BlurTargetView` holding the ambient scene and the orb; Dimezis blur, RenderNode on Android 12+, off below; iOS native) |
| Translucent fill, tint | Theme-aware colour at restrained opacity; dense (`strong`) only where text sits on it |
| Palette reflections | **Simulated:** soft radial fields of the accent (upper left) and `orbSecondary` (lower right) |
| Specular highlight, light pool | **Gradient-based:** a top-edge gradient and a corner pool, white on Light, palette-tinted on Dark |
| Bounce light | **Simulated:** a faint accent glow along the lower edge |
| Rim | **Simulated edge lighting:** a diagonal gradient stroke (bright at the lit corner, nearly clear at the sides, accent at the far corner) and an inner hairline for thickness |
| Layered shadow | Three real `boxShadow` layers: contact, soft and an accent glow |
| Moving highlight | The sheet sweeps a diagonal sheen across itself as it rises |

**Not implemented:** optical refraction or edge distortion of the content behind the glass. Gradients are not refraction and are not claimed to be. AndroidLiquidGlass is **not** integrated (Compose-only; see the design doc). `src/native/liquid-glass` is the seam where a native renderer would replace `GlassSurface`; `getGlassRenderer()` reports `rn-approximation`.

Light glass is clear and bright with white highlights; Dark glass is deeper, with a restrained palette-coloured highlight and a coloured rim. They are separate token sets, not an inversion.

Where it is used: the header controls (one pill), the chat panel (the transcript and the flat glass composer field on it), the orb colour sheet, the Settings sheet and the delete confirmation. Settings and the confirmation are in the React tree rather than a `Modal`, so the blur and theme reach them.

The page behind the glass is drawn inside the blur target: an ambient scene of soft colour fields in the orb's palette (so the glass has colour to blur) and the orb itself. The orb is no longer frozen when a sheet opens: the earlier workaround (page `filter` blur plus a paused orb) is gone.

## 3. Persistence and voice

`namesinger-appearance.json` holds `{version, themePreference, orbTheme}`. Voice is a separate, unimplemented setting; the chooser says the orb colours do not change the assistant's voice.

## 4. Limitations

- Backdrop blur samples only the page layer (scene and orb). The chat panel and header blur it; the sheets blur it too, but cannot blur the chat panel or text beneath them, because a blur view cannot live inside its own target.
- No refraction; no AndroidLiquidGlass; no dev build.
- Android below 12 does not blur (a translucent fill is drawn instead).
- Emulator only. The software-rendered emulator was slow while blurring an animating orb: a Light to Dark switch took several seconds to show with a sheet open. Not measured on a physical low-end phone.
- Text colours change at once on a palette change; only the orb, scene and wash are animated.
- No real voice input, physical device, iOS or screen reader testing.
