import * as fs from 'fs';
import * as path from 'path';

import { composerPlaceholder } from '../src/components/Composer';
import {
  isSwipeUp,
  OPENING_HEADLINE,
  OPENING_HINT,
  SWIPE_DISTANCE,
  SWIPE_FAST_DISTANCE,
  SWIPE_FAST_VELOCITY,
} from '../src/components/OpeningScreen';
import { messageWithLiveChips } from '../src/components/Transcript';
import type { ChatMessage } from '../src/conversation/types';
import { keyboardInset } from '../src/hooks/useKeyboardInset';

const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('swipe up detection', () => {
  it('accepts a long upward drag', () => {
    expect(isSwipeUp({ dx: 4, dy: -SWIPE_DISTANCE, vy: -0.1 })).toBe(true);
    expect(isSwipeUp({ dx: 10, dy: -300, vy: -0.2 })).toBe(true);
  });

  it('accepts a short fast flick', () => {
    expect(isSwipeUp({ dx: 0, dy: -SWIPE_FAST_DISTANCE, vy: -SWIPE_FAST_VELOCITY })).toBe(true);
    expect(isSwipeUp({ dx: 3, dy: -45, vy: -1.4 })).toBe(true);
  });

  it('rejects a short slow drag, a tap, and a drag that stops early', () => {
    expect(isSwipeUp({ dx: 0, dy: -20, vy: -0.1 })).toBe(false);
    expect(isSwipeUp({ dx: 0, dy: 0, vy: 0 })).toBe(false);
    expect(isSwipeUp({ dx: 0, dy: -60, vy: -0.1 })).toBe(false);
  });

  it('rejects downward and mostly sideways drags, however far or fast', () => {
    expect(isSwipeUp({ dx: 0, dy: 200, vy: 1 })).toBe(false);
    expect(isSwipeUp({ dx: 300, dy: -120, vy: -1 })).toBe(false);
    expect(isSwipeUp({ dx: -250, dy: -90, vy: -2 })).toBe(false);
  });
});

describe('the opening screen', () => {
  const opening = read('src/components/OpeningScreen.tsx');
  const shell = read('src/components/AppShell.tsx');

  it('shows a headline, the swipe affordance and the glass orb, with NameSinger branding', () => {
    expect(OPENING_HEADLINE.length).toBeGreaterThan(5);
    expect(OPENING_HINT).toBe('Swipe up to enter');
    expect(opening).toContain('OPENING_LABEL');
    expect(read('src/components/OpeningScreen.tsx')).toContain("'NameSinger'");
    expect(`${opening}${read('src/components/GlassOrb.tsx')}`).not.toMatch(/ChatGPT|Wabi|OpenAI/i);
  });

  it('is not a video: no video component, no media file', () => {
    for (const f of ['OpeningScreen', 'GlassOrb', 'AppShell']) {
      expect(read(`src/components/${f}.tsx`)).not.toMatch(/expo-video|expo-av|<Video|\.mp4|\.mov|\.webm/);
    }
    expect(fs.readdirSync(path.join(__dirname, '..', 'assets')).filter((n) => /\.(mp4|mov|webm)$/i.test(n))).toEqual([]);
  });

  it('asks for nothing and reaches nothing: no recorder, microphone, consent, speech or storage', () => {
    for (const f of ['OpeningScreen', 'GlassOrb']) {
      expect(code(`src/components/${f}.tsx`)).not.toMatch(
        /useNameRecorder|expo-audio|expo-speech|useConsent|Permission|useConversation|expo-file-system/,
      );
    }
  });

  it('follows the finger and commits only on a real swipe, using the same rule that is tested here', () => {
    expect(opening).toContain('PanResponder.create');
    expect(opening).toContain('if (interactiveRef.current && isSwipeUp(g))');
    expect(opening).toMatch(/onMoveShouldSetPanResponder:[\s\S]*g\.dy < -6[\s\S]*Math\.abs\(g\.dy\) > Math\.abs\(g\.dx\)/);
    expect(opening).toContain('drag.setValue(');
    expect(opening).toContain('Animated.spring(drag');
  });

  it('can be entered without a gesture (screen readers) and says so', () => {
    expect(opening).toContain("accessibilityActions={[{ name: 'activate', label: 'Enter NameSinger' }]}");
    expect(opening).toContain('onAccessibilityAction');
    expect(opening).toContain('accessibilityRole="button"');
    expect(opening).toMatch(/accessibilityLabel=\{`NameSinger\. \$\{OPENING_HEADLINE\} \$\{OPENING_HINT\}/);
  });

  it('ignores a second swipe once the transition is running', () => {
    expect(opening).toContain("pointerEvents={interactive ? 'auto' : 'none'}");
    expect(shell).toContain('interactive={stage === \'opening\'}');
    expect(shell).toContain('if (requested.current) return;');
  });

  it('plays its half of the hand-off with native animation, and a reduced-motion variant', () => {
    expect(opening).not.toMatch(/useNativeDriver: false/);
    expect(opening).toContain('reducedMotion');
    expect(shell).toContain('REDUCED_TRANSITION_MS');
    expect(shell).toContain('useNativeDriver: true');
  });

  it('is a glass orb drawn with gradients, with a refracted wordmark and a glow, not an image', () => {
    const glass = read('src/components/GlassOrb.tsx');
    expect(glass).toContain('RadialGradient');
    expect(glass).toContain('LinearGradient');
    expect(glass).not.toMatch(/<Image\b|require\(/);
    expect(glass.match(/<Text/g)!.length).toBeGreaterThanOrEqual(3); // the word is drawn three times with a colour offset
  });
});

describe('the hand-over from the opening to the conversation', () => {
  const shell = read('src/components/AppShell.tsx');

  it('mounts the conversation (and with it the recorder) only after the user commits to entering', () => {
    expect(shell).toMatch(/stage !== 'opening' \? \(\s*<ConversationScreen/);
    expect(read('src/app/index.tsx')).not.toMatch(/useNameRecorder|useConversation|expo-audio/);
    expect(shell).not.toMatch(/useNameRecorder|expo-audio/);
  });

  it('lands the glass orb on the spot where the violet orb is, by measuring it', () => {
    expect(shell).toContain('onOrbCenter');
    expect(shell).toContain('setTargetOffsetY(centerY - height / 2)');
    expect(read('src/components/ConversationScreen.tsx')).toContain('measureInWindow');
  });

  it('starts the animation only after the orb has been measured, with a fallback so the user is never stuck', () => {
    expect(shell).toContain('if (!measured.current && requested.current)');
    expect(shell).toContain('if (!measured.current) run();');
  });

  it('asks the first question only when the hand-over has finished', () => {
    expect(shell).toContain('setStarted(true)');
    expect(shell).toMatch(/if \(finished\) \{\s*setStage\('conversation'\);\s*setStarted\(true\);/);
    expect(read('src/components/ConversationScreen.tsx')).toContain('if (started) conv.begin();');
  });

  it('removes the opening once it is done, and does not persist that it was seen', () => {
    expect(shell).toMatch(/stage !== 'conversation' \? \(\s*<OpeningScreen/);
    expect(code('src/components/AppShell.tsx')).not.toMatch(/expo-file-system|AsyncStorage|localStorage/);
  });
});

describe('the main screen layout', () => {
  const screen = read('src/components/ConversationScreen.tsx');

  it('has one visual hierarchy: the orb, then the status line, then the transcript and composer', () => {
    const orb = screen.indexOf('ref={orbBox}');
    const caption = screen.indexOf('{conv.caption}');
    const transcript = screen.indexOf('ref={chatBox}'); // the transcript's space; it is drawn in the page layer behind
    const composer = screen.indexOf('<Composer');
    expect(orb).toBeGreaterThan(-1);
    expect(caption).toBeGreaterThan(orb);
    expect(transcript).toBeGreaterThan(caption);
    expect(composer).toBeGreaterThan(transcript);
  });

  it('contains none of the old interface: no cards, recorder, language grid or song card', () => {
    expect(screen).not.toMatch(/Section|NameRecorder|SongGenerator|LanguageSelector|ConsentNotice|AudioPreview|WelcomeScreen|CreateScreen/);
    for (const f of ['NameRecorder', 'SongGenerator', 'CreateScreen', 'OrbStage', 'WelcomeScreen', 'LanguageSelector', 'ConsentNotice', 'AudioPreview']) {
      expect(fs.existsSync(path.join(__dirname, '..', `src/components/${f}.tsx`))).toBe(false);
    }
  });

  it('keeps secondary controls in one small settings entry, not on the main screen', () => {
    expect(screen).toContain('<SettingsSheet');
    expect(screen).not.toContain('<ConsentSettings');
    expect(screen).not.toMatch(/Delete recording|Withdraw/);
  });

  it('sizes the orb from the space it actually has, so the keyboard and a 320 dp screen shrink it instead of hiding things', () => {
    expect(screen).toContain('Math.max(96, Math.min(width * 0.9, height, 340))');
    expect(screen).toContain('paddingBottom: keyboard.inset');
  });

  it('voice mode off shrinks the orb to a compact corner version and keeps the conversation', () => {
    expect(screen).toContain('const COMPACT_ORB = 64;');
    expect(screen).toContain("'Tap to open voice mode.'");
  });

  it('the voice toggle and settings buttons are labelled round buttons of at least 48 dp', () => {
    expect(screen).toContain("label={voiceMode ? 'Turn voice off' : 'Turn voice on'}");
    expect(screen).toContain('label="Settings"');
    // The header controls are glass icon buttons, 48 dp by default (never below it).
    expect(screen).toContain('<GlassIconButton flat label="Settings" icon="settings"');
    const glassButton = read('src/components/glass/GlassIconButton.tsx');
    expect(glassButton).toContain('size = 48');
    expect(glassButton).toContain('Math.max(minTouchTarget, size)');
  });

  it('has no development text outside development builds', () => {
    expect(screen).toContain('__DEV__ ? <DevReadout');
    expect(read('src/conversation/useConversation.ts')).toContain('if (__DEV__ && text.trim() === \'/testvoice\')');
    expect(read('src/components/SettingsSheet.tsx')).toContain('__DEV__ && onDevTestVoice');
  });
});

describe('the keyboard', () => {
  it('adds no space when the keyboard is hidden', () => {
    expect(keyboardInset({ keyboardHeight: 0, bottomSafeArea: 24, fullHeight: 900, currentHeight: 900 })).toBe(0);
  });

  it('lifts the layout by the keyboard height when the window did not resize', () => {
    expect(keyboardInset({ keyboardHeight: 312, bottomSafeArea: 24, fullHeight: 914, currentHeight: 914 })).toBe(312);
  });

  it('adds nothing when the window already shrank by about the keyboard height', () => {
    expect(keyboardInset({ keyboardHeight: 312, bottomSafeArea: 24, fullHeight: 914, currentHeight: 602 })).toBe(0);
    expect(keyboardInset({ keyboardHeight: 312, bottomSafeArea: 0, fullHeight: 914, currentHeight: 700 })).toBe(0);
  });

  it('a small resize does not hide the need for a lift', () => {
    expect(keyboardInset({ keyboardHeight: 312, bottomSafeArea: 24, fullHeight: 914, currentHeight: 880 })).toBe(312);
  });

  it('the composer sits under the transcript and both live above the keyboard inset', () => {
    const screen = read('src/components/ConversationScreen.tsx');
    expect(screen).toContain('{ paddingBottom: keyboard.inset }');
    expect(screen).toContain('{body}');
    expect(read('src/components/Composer.tsx')).toContain('blurOnSubmit={false}');
  });
});

describe('the composer', () => {
  it('is the same field at every step, with a placeholder that suggests the current answer', () => {
    expect(composerPlaceholder('ask-name')).toMatch(/name/i);
    expect(composerPlaceholder('review-take')).toMatch(/use it|again/i);
    expect(composerPlaceholder('ask-language')).toMatch(/language/i);
    expect(composerPlaceholder('confirm-make')).toMatch(/yes/i);
    expect(composerPlaceholder('making')).toBe('Type a message');
  });

  it('sends whatever is typed to the one conversation action, whatever the step', () => {
    const composer = read('src/components/Composer.tsx');
    expect(composer).toContain('onSend(text)');
    expect(composer).not.toMatch(/parseName|ask-name.*onSend|step ===/);
    expect(composer).toContain('maxLength={COMPOSER_MAX_LENGTH}');
    expect(composer).toContain('accessibilityLabel="Message"');
    expect(composer).toContain('label="Send message"');
  });
});

describe('the transcript', () => {
  const message = (over: Partial<ChatMessage>): ChatMessage => ({
    id: Math.random().toString(),
    role: 'assistant',
    text: 'x',
    kind: 'text',
    chips: [],
    speak: true,
    ...over,
  });
  const chips = [{ id: 'make' as const, label: 'Make' }];

  it('shows reply buttons under the newest message that has them', () => {
    const withChips = message({ chips });
    expect(messageWithLiveChips([message({}), withChips])).toBe(withChips);
  });

  it('keeps them when a note is added after (the demo-track note must not hide them)', () => {
    const withChips = message({ chips });
    expect(messageWithLiveChips([withChips, message({ role: 'system' })])).toBe(withChips);
  });

  it('hides them once the user answers', () => {
    expect(messageWithLiveChips([message({ chips }), message({ role: 'user' })])).toBeNull();
  });

  it('shows only one set at a time, never an older one', () => {
    const older = message({ chips });
    const newer = message({ chips: [{ id: 'take-use', label: 'Use' }] });
    expect(messageWithLiveChips([older, newer])).toBe(newer);
  });

  it('scrolls to the newest message when one arrives or the space changes', () => {
    const transcript = read('src/components/Transcript.tsx');
    expect(transcript).toContain('scrollToEnd');
    expect(transcript).toContain('onContentSizeChange');
    expect(transcript).toContain('[messages.length]');
    expect(transcript).toContain('keyboardShouldPersistTaps="handled"');
  });

  it('labels each message with who said it, for screen readers', () => {
    const transcript = read('src/components/Transcript.tsx');
    expect(transcript).toContain("'You' : 'NameSinger'");
    expect(transcript).toContain('accessibilityLabel="Conversation"');
  });
});

describe('settings', () => {
  const sheet = read('src/components/SettingsSheet.tsx');

  it('holds consent withdrawal, recording deletion and the permission shortcut', () => {
    expect(sheet).toContain('<ConsentSettings');
    expect(sheet).toContain('label="Delete recording"');
    expect(sheet).toContain('label="Open Android settings"');
  });

  it('deleting is explicit and confirmed, and withdrawing consent never deletes', () => {
    expect(sheet).toContain('ConfirmDestructive');
    expect(sheet).toContain('onConfirm={() => {');
    expect(code('src/components/ConsentSettings.tsx')).not.toMatch(/deleteRecording|recorder\.reset|discard/);
  });

  it('is a glass sheet that can always be closed (Done, tap outside, drag, Android back)', () => {
    expect(sheet).toContain('<GlassBottomSheet visible={visible} onClose={onClose} title="Settings" scrollable>');
    const glassSheet = read('src/components/glass/GlassBottomSheet.tsx');
    expect(glassSheet).toContain('Done');
    expect(glassSheet).toContain("BackHandler.addEventListener('hardwareBackPress'");
  });
});
