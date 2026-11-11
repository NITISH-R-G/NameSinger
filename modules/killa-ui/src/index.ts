import { requireNativeView } from 'expo';
import type { Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

type PressEvent = { nativeEvent: Record<string, never> };

export interface KillaButtonProps {
  style?: StyleProp<ViewStyle>;
  label: string;
  /** primary: the big script plate. plate: the quieter plate. tab: a tab-row plate. chip: Killa's pill chip, selectable. */
  variant: 'primary' | 'plate' | 'tab' | 'chip';
  selected?: boolean;
  disabled?: boolean;
  onPress?: (e: PressEvent) => void;
}

export interface KillaFieldProps {
  style?: StyleProp<ViewStyle>;
  value: string;
  hint?: string;
  maxLength?: number;
  onChangeText?: (e: { nativeEvent: { text: string } }) => void;
  onSubmit?: (e: PressEvent) => void;
}

export interface KillaStaffProps {
  style?: StyleProp<ViewStyle>;
  /** 0..1000 */
  progress: number;
  indeterminate?: boolean;
}

export interface KillaRecordProps {
  style?: StyleProp<ViewStyle>;
  spinning?: boolean;
}

export interface KillaDeckProps {
  ref?: Ref<KillaDeckHandle>;
  style?: StyleProp<ViewStyle>;
  /** Absolute path of an audio file; it starts playing when it changes. */
  source?: string | null;
  title?: string;
}

export interface KillaDeckHandle {
  replay: () => Promise<void>;
}

export const KillaButton = requireNativeView<KillaButtonProps>('KillaUi', 'KillaButtonView');
export const KillaField = requireNativeView<KillaFieldProps>('KillaUi', 'KillaFieldView');
export const KillaStaff = requireNativeView<KillaStaffProps>('KillaUi', 'KillaStaffView');
export const KillaRecord = requireNativeView<KillaRecordProps>('KillaUi', 'KillaRecordView');
export const KillaDeck = requireNativeView<KillaDeckProps>('KillaUi', 'KillaDeckView');
