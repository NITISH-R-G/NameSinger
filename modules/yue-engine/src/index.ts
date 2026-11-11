import { requireNativeModule } from 'expo';

export interface EngineStatus {
  running: boolean;
  healthy: boolean;
  exitCode: number | null;
}

export interface GenerateResult {
  audioPath: string;
  replayJson: string;
}

export interface YueEngineNative {
  nativeLibraryDir(): string;
  hasEngineBinary(): boolean;
  modelsDir(): string;
  songsDir(): string;
  fileSize(path: string): number;
  freeStorageBytes(): number;
  availableMemoryBytes(): number;
  start(modelPath: string, vaePath: string, threads: number, maxSeq: number, gentle: boolean): string;
  stop(): string;
  status(): EngineStatus;
  recentLog(n: number): string[];
  generate(requestJson: string, outDir: string, tag: string): Promise<GenerateResult>;
  cancel(): boolean;
  saveToMusic(path: string, displayName: string): string;
  shareUri(uri: string, title: string): boolean;
}

/** The native engine host. Android only; null where the module is not part of the build. */
export function loadYueEngine(): YueEngineNative | null {
  try {
    return requireNativeModule<YueEngineNative>('YueEngine');
  } catch {
    return null;
  }
}
