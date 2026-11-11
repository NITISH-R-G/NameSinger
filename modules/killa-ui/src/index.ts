import { requireNativeModule, requireNativeView } from 'expo';
import type { Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

type PressEvent = { nativeEvent: Record<string, never> };

export interface KillaButtonProps {
  style?: StyleProp<ViewStyle>;
  label: string;
  /** primary: the big script plate. plate: the quieter plate. tab: a tab-row plate. chip: Killa's pill chip, selectable. */
  variant: 'primary' | 'plate' | 'link' | 'tab' | 'chip';
  selected?: boolean;
  disabled?: boolean;
  onPress?: (e: PressEvent) => void;
}

export interface KillaSegmentedProps {
  style?: StyleProp<ViewStyle>;
  options: string[];
  selectedIndex: number;
  onSelect?: (e: { nativeEvent: { index: number } }) => void;
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
  /** Degrees per second. 0 stops the record (it eases to a stop); 200 is a 33 rpm record. */
  speed: number;
}
export const KillaButton = requireNativeView<KillaButtonProps>('KillaUi', 'KillaButtonView');
export const KillaSegmented = requireNativeView<KillaSegmentedProps>('KillaUi', 'KillaSegmentedView');
export const KillaField = requireNativeView<KillaFieldProps>('KillaUi', 'KillaFieldView');
export const KillaStaff = requireNativeView<KillaStaffProps>('KillaUi', 'KillaStaffView');
export const KillaRecord = requireNativeView<KillaRecordProps>('KillaUi', 'KillaRecordView');
/** The real amplitude shape of an audio file as ars values 0..1 (empty if it cannot be decoded). */
export async function loadWaveform(path: string, bars: number): Promise<number[]> {
  try {
    const mod = requireNativeModule<{ waveform(path: string, bars: number): Promise<number[]> }>('KillaUi');
    return await mod.waveform(path, bars);
  } catch {
    return [];
  }
}
