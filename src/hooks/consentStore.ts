/**
 * Persisted consent acknowledgement. Pure logic over an injected storage port, so every outcome
 * (first launch, restart, corrupt file, changed version, failed read, failed write) is unit-tested
 * without native modules.
 *
 * What is stored: the consent notice version the user acknowledged and when. Nothing else. No
 * voice, no name, no identifier. Android microphone permission is NOT stored here and is never
 * inferred from it; the permission is asked of the operating system on every recording.
 *
 * Versioning: see docs/ux/consent-persistence.md and CONSENT_NOTICE_VERSION.
 */

export interface ConsentStorePort {
  /** The stored text, or null when nothing has been stored. Throws on a real read failure. */
  read: () => Promise<string | null>;
  /** Replaces the stored text. Throws on failure. */
  write: (text: string) => Promise<void>;
  /** Deletes the stored record. A record that is already absent counts as success. Throws on failure. */
  remove: () => Promise<void>;
}

export interface StoredConsent {
  version: string;
  acknowledgedAt: string;
}

export type LoadedConsent =
  | { acknowledged: true; acknowledgedAt: string }
  | { acknowledged: false; reason: 'none' | 'version_changed' | 'invalid' | 'read_failed' };

export type SavedConsent = { saved: true } | { saved: false };
export type WithdrawnConsent = { withdrawn: true } | { withdrawn: false };

function parse(text: string): StoredConsent | null {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return null;
    const { version, acknowledgedAt } = value as Record<string, unknown>;
    if (typeof version !== 'string' || version.length === 0) return null;
    if (typeof acknowledgedAt !== 'string') return null;
    return { version, acknowledgedAt };
  } catch {
    return null;
  }
}

/**
 * Whether the user has acknowledged exactly this version of the notice. Anything unexpected
 * (missing, unreadable, corrupt, other version) means "not acknowledged", so the notice is shown
 * again. It never throws and never reports consent it could not confirm.
 */
export async function loadConsent(port: ConsentStorePort, currentVersion: string): Promise<LoadedConsent> {
  let text: string | null;
  try {
    text = await port.read();
  } catch {
    return { acknowledged: false, reason: 'read_failed' };
  }
  if (text === null) return { acknowledged: false, reason: 'none' };
  const stored = parse(text);
  if (stored === null) return { acknowledged: false, reason: 'invalid' };
  if (stored.version !== currentVersion) return { acknowledged: false, reason: 'version_changed' };
  return { acknowledged: true, acknowledgedAt: stored.acknowledgedAt };
}

/**
 * Stores the acknowledgement and reads it back. `saved: true` means the acknowledgement was
 * confirmed in storage; a failed write, or a write that cannot be read back, is `saved: false`.
 * It never throws.
 */
export async function saveConsent(
  port: ConsentStorePort,
  version: string,
  now: Date = new Date(),
): Promise<SavedConsent> {
  const record: StoredConsent = { version, acknowledgedAt: now.toISOString() };
  const text = JSON.stringify(record);
  try {
    await port.write(text);
    const back = await port.read();
    return { saved: back === text };
  } catch {
    return { saved: false };
  }
}

/**
 * Withdraws the stored acknowledgement. The record is deleted; if deletion fails, it is overwritten
 * with a record that can never match a notice version. Each step is checked by loading the record
 * again: `withdrawn: true` means storage was read back and no longer holds an acknowledgement.
 * A storage that cannot be read afterwards is not proof, so that is `withdrawn: false`. It never
 * throws and never reports a withdrawal it could not confirm.
 *
 * Only this one small file is touched. Voice recordings, songs and every other preference are
 * outside its reach by construction: it holds no reference to them.
 */
export async function withdrawConsent(
  port: ConsentStorePort,
  currentVersion: string,
  now: Date = new Date(),
): Promise<WithdrawnConsent> {
  try {
    await port.remove();
  } catch {
    // Checked below; deletion is not trusted either way.
  }
  let check = await loadConsent(port, currentVersion);
  if (check.acknowledged || check.reason === 'read_failed') {
    // The record is still there (or unreadable): overwrite it with one that cannot match.
    try {
      await port.write(JSON.stringify({ withdrawnAt: now.toISOString() }));
    } catch {
      // The check below reports what storage actually holds.
    }
    check = await loadConsent(port, currentVersion);
  }
  return { withdrawn: !check.acknowledged && check.reason !== 'read_failed' };
}
