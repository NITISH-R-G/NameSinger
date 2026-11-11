import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Space the layout must leave at the bottom so the keyboard never covers the composer and the
 * newest messages.
 *
 * Whether Android resizes the window for the keyboard depends on the host (a standalone build, Expo
 * Go and iOS differ), so the answer is measured: the container reports its height, and if it already
 * shrank by about the keyboard's height there is nothing to add; otherwise the reported keyboard
 * height is returned. Pure arithmetic is in `keyboardInset` for tests.
 */
export function keyboardInset(input: {
  keyboardHeight: number;
  bottomSafeArea: number;
  fullHeight: number;
  currentHeight: number;
}): number {
  if (input.keyboardHeight <= 0) return 0;
  const shrank = input.fullHeight - input.currentHeight;
  if (shrank >= input.keyboardHeight * 0.6) return 0; // the window was resized already
  // Android reports the keyboard height without the navigation bar it also covers, and the screen's
  // bottom safe-area padding already stands in for that bar, so the reported height is the right inset.
  // (Measured on an Android 15 emulator, 24 dp navigation inset, 312 dp keyboard.)
  return input.keyboardHeight;
}

export function useKeyboardInset(bottomSafeArea: number): {
  inset: number;
  onContainerLayout: (height: number) => void;
} {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [currentHeight, setCurrentHeight] = useState(0);
  const fullHeight = useRef(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => setKeyboardHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return {
    inset: keyboardInset({
      keyboardHeight,
      bottomSafeArea,
      fullHeight: fullHeight.current || currentHeight,
      currentHeight,
    }),
    onContainerLayout: (height) => {
      // The tallest height seen while the keyboard is hidden is the "full" height.
      if (keyboardHeight === 0 && height > fullHeight.current) fullHeight.current = height;
      setCurrentHeight(height);
    },
  };
}
