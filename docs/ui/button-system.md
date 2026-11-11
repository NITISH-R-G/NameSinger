> **Superseded in part:** the screen layout and components described here were replaced by the conversational interface. See [conversational-interface.md](../ux/conversational-interface.md).

# NameSinger button system

One component, `ActionButton` (`src/components/ActionButton.tsx`), with variants defined in `src/theme/buttonStyles.ts`. Screens choose a variant by meaning; they do not restyle buttons.

## Variants

| Variant | Use it for | Width | Look |
|---|---|---|---|
| `primary` | The main forward action on a screen or card (Make a song with my name, Record my name, Use this recording, I agree, Try again after a denied microphone prompt, Open settings after a blocked one, Record again after an unusable take) | Full width | Solid brand purple, white text |
| `secondary` | A supporting or alternative action (No thanks, Open settings next to Try again, Record again, Re-record, Make it again) | Full width | White, purple outline and text |
| `neutral` | Cancel and go back on a confirmation screen (Keep my recording) | Full width | Grey fill, dark text |
| `destructive` | The final, confirmed destructive action. **Only** on a screen dedicated to confirming it (`ConfirmDestructive`) | Full width | Solid red, white text |
| `destructiveText` | A destructive action on an ordinary screen (Delete recording); it opens the confirmation screen | Full width | Red text, no fill or border |
| `contextual` | A control that belongs to a card or row (Play and Stop inside an audio card, More details / Hide details in the consent card, the development test voice) | Sized to its label | Compact outlined |
| round `IconButton` | The record, stop, play and pause controls under the voice orb (a 56 dp circle with an icon; the label is its only text alternative) | 56 dp circle | Same colours as `primary` (main action) or `secondary` (supporting, e.g. stop) |

**Red is reserved for destructive variants.** Stop recording and Stop playback are not destructive, so they are not red.

## Layout

- A primary button sits **19 dp** from both screen edges: screen gutter 4 + card border 1 + card padding 14 (`layout` in `src/theme/tokens.ts`). Buttons are not placed inside tinted panels, which would push them inwards.
- Every button is at least **48 dp** tall.
- Stacked buttons and buttons sharing a row use the same **12 dp** gap (`layout.buttonGap`).
- **Two equally important actions** share a row with `ButtonRow` (equal width, labels wrap on narrow screens). It is used once: Re-record and Use this recording. Do not put unrelated or secondary actions in it.

## States

Every button reports `accessibilityRole="button"`, its label, and `disabled` and `busy` state. `loading` shows a spinner and ignores presses. Pressed feedback is a darker fill (solid variants), a tinted fill (outlined and text variants) and a small scale. Disabled and loading look the same, in grey.

## Verified

Measured on an Android 15 emulator (Expo Go) at 320, 411 and 480 dp wide: primary buttons at 19 dp margins and 48 dp tall; the row buttons equal in width and, after the height fix, in height; no overflow. Contrast of every variant in every state is asserted in `__tests__/buttonHierarchy.test.ts`. Not tested on a physical device, on iOS, or with a screen reader.
