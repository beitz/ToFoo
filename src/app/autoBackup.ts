/**
 * When the app saves its automatic backups (docs/SPEC.md, "Automatic backups"): the daily one a few
 * seconds after start-up and whenever the app comes back to the foreground on a new day. Backups
 * before a restore or an upgrade are saved by the storage layer itself (src/storage/autoBackup.ts).
 */
import { diag } from './diagnostics';
import { repo } from '../storage/repo';

/** Leave the first seconds after start-up to the app itself. */
const START_DELAY_MS = 3000;

let running: Promise<void> | null = null;

async function run(): Promise<void> {
  try {
    const saved = await repo.dailyAutoBackup(new Date());
    if (saved) diag('autoBackup.saved', { reason: saved.reason, size: saved.size });
    await checkAutoBackups();
  } catch (e) {
    diag('autoBackup.failed', { error: String(e) });
  }
}

/** Run once now (unless a run is going); safe to call often. */
export function autoBackupNow(): Promise<void> {
  running ??= run().finally(() => (running = null));
  return running;
}

/**
 * Read every unchecked automatic backup back the way a restore would, so one that could not be
 * restored shows its problem on the Backup page now and not on the day it is needed.
 */
export async function checkAutoBackups(): Promise<void> {
  const unchecked = (await repo.listAutoBackups()).filter((b) => b.problem === undefined);
  if (!unchecked.length) return;
  // Loaded on demand: the validator is only needed here and on the Backup page.
  const { parseExchange } = await import('../exchange/parse');
  for (const b of unchecked) {
    const res = parseExchange(b.json);
    const problem = res.ok ? '' : res.error;
    if (problem) diag('autoBackup.selfCheckFailed', { reason: b.reason, error: problem });
    await repo.setAutoBackupProblem(b.id, problem);
  }
}

/** Start the daily backup after start-up and on every return to the app. Returns a cleanup function. */
export function startAutoBackups(): () => void {
  const timer = window.setTimeout(() => void autoBackupNow(), START_DELAY_MS);
  const onVisible = () => document.visibilityState === 'visible' && void autoBackupNow();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
