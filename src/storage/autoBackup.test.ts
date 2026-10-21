import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { parseExchange } from '../exchange/parse';
import { dailyBackupDue } from './autoBackup';
import { ToFooDB } from './db';
import { createRepo, type Snapshot } from './repo';

let n = 0;
async function fresh() {
  const repo = createRepo(new ToFooDB(`auto-${n++}`));
  await repo.init('2026-10-18');
  return repo;
}

const at = (day: string, hour = 9) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`);

async function withEntry() {
  const repo = await fresh();
  await repo.addLog({ kind: 'drink', drink: 'tea', time: 1, day: '2026-10-18', confidence: 'A', label: 'Tea' });
  return repo;
}

function data(json: string): Snapshot {
  const res = parseExchange(json);
  if (!res.ok || res.value.type !== 'backup') throw new Error(res.ok ? 'not a backup' : res.error);
  return res.value.data as Snapshot;
}

describe('automatic backups', () => {
  it('saves one daily backup per day, readable like an exported file', async () => {
    const repo = await withEntry();
    const first = await repo.dailyAutoBackup(at('2026-10-18', 8));
    expect(first).toMatchObject({ reason: 'daily', counts: { log: 1 } });
    expect(await repo.dailyAutoBackup(at('2026-10-18', 22))).toBeUndefined();
    expect(await repo.dailyAutoBackup(at('2026-10-19', 7))).toBeDefined();
    const list = await repo.listAutoBackups();
    expect(list.map((b) => b.reason)).toEqual(['daily', 'daily']);
    expect(data(list[0]!.json).log).toEqual(await repo.db.log.toArray());
    expect(list[0]!.size).toBe(new TextEncoder().encode(list[0]!.json).length);
  });

  it('keeps the newest 5, or the number set', async () => {
    const repo = await withEntry();
    for (let d = 1; d <= 7; d++) await repo.dailyAutoBackup(at(`2026-11-0${d}`));
    const list = await repo.listAutoBackups();
    expect(list.map((b) => new Date(b.at).getDate())).toEqual([7, 6, 5, 4, 3]);
    await repo.setAutoBackupKeep(2);
    expect((await repo.listAutoBackups()).map((b) => new Date(b.at).getDate())).toEqual([7, 6]);
  });

  it('saves nothing when switched off or before there is any data', async () => {
    const empty = await fresh();
    expect(await empty.dailyAutoBackup(at('2026-10-18'))).toBeUndefined();
    const repo = await withEntry();
    const s = (await repo.getSettings())!;
    await repo.updateSettings({ features: { ...s.features, autoBackup: false } });
    expect(await repo.dailyAutoBackup(at('2026-10-18'))).toBeUndefined();
    expect(await repo.db.autoBackups.count()).toBe(0);
  });

  it('saves the data a restore replaces, and the restore can be undone from it', async () => {
    const repo = await withEntry();
    await repo.setMeta('portions:C133000', [{ label: 'My bowl', grams: 60 }]);
    const before = await repo.snapshot();
    expect(before.portionSizes).toEqual([{ food: 'C133000', sizes: [{ label: 'My bowl', grams: 60 }] }]);

    await repo.restore({ ...before, log: [], portionSizes: [] }, { backupFirst: true });
    expect(await repo.db.log.count()).toBe(0);
    expect(await repo.getMeta('portions:C133000')).toBeUndefined();
    const [saved] = await repo.listAutoBackups();
    expect(saved!.reason).toBe('restore');

    await repo.restore(data(saved!.json));
    expect(await repo.snapshot()).toEqual(before);
  });

  it('keeps saved portion sizes when restoring a backup from before they were included', async () => {
    const repo = await withEntry();
    await repo.setMeta('portions:C133000', [{ label: 'My bowl', grams: 60 }]);
    const { portionSizes: _sizes, ...older } = await repo.snapshot();
    await repo.restore(older);
    expect(await repo.getMeta('portions:C133000')).toEqual([{ label: 'My bowl', grams: 60 }]);
  });

  it('is due once the newest one is from an earlier day', () => {
    expect(dailyBackupDue(undefined, at('2026-10-18'))).toBe(true);
    expect(dailyBackupDue(at('2026-10-18', 1).getTime(), at('2026-10-18', 23))).toBe(false);
    expect(dailyBackupDue(at('2026-10-17', 23).getTime(), at('2026-10-18', 0))).toBe(true);
  });
});

describe('backup before an app update changes how data is stored', () => {
  // A phone on database version 7, the last one before automatic backups.
  async function version7Db(name: string, log: object[]) {
    const old = new Dexie(name);
    old.version(7).stores({
      profile: 'id', settings: 'id', recipes: 'id, name, updatedAt', batches: 'id, recipeId, cookedDay', log: 'id, time, day, kind', customFoods: 'id, name',
      dayStatus: 'day', fasts: 'id, startDay', sunEntries: 'id, day', meta: 'key', products: 'id, name', journal: 'id, time, day', sleep: 'id, start, day',
      activities: 'id, time, day', water: 'id, time, day', chats: 'id, updatedAt', chatPhotos: 'id, chatId',
    });
    await old.open();
    await old.table('profile').put({ id: 'profile', schemaVersion: 1, weightHistory: [], salt: { iodised: true, fluoridated: false }, exclusions: { groups: [], foods: [] }, startingLevel: 'empty', modelStartDay: '2026-10-01', onboarded: true });
    await old.table('log').bulkPut(log);
    await old.table('meta').put({ key: 'portions:C133000', value: [{ label: 'My bowl', grams: 60 }] });
    old.close();
  }
  const oats = { id: 'l1', schemaVersion: 1, time: 1, day: '2026-10-01', confidence: 'A', label: 'Oats', kind: 'food', ref: { source: 'BLS', version: '4.0', code: 'C133000' }, grams: 60, preparation: 'asListed' };

  it('saves one copy of the data as it was before the upgrade', async () => {
    await version7Db('upgrade-backup-1', [oats]);
    const repo = createRepo(new ToFooDB('upgrade-backup-1'));
    await repo.init('2026-10-18');
    const list = await repo.listAutoBackups();
    expect(list.map((b) => b.reason)).toEqual(['upgrade']);
    const saved = data(list[0]!.json);
    expect(saved.log).toEqual([oats]);
    expect(saved.portionSizes).toEqual([{ food: 'C133000', sizes: [{ label: 'My bowl', grams: 60 }] }]);
    repo.db.close();

    // Opening again (no upgrade) saves nothing new.
    const again = createRepo(new ToFooDB('upgrade-backup-1'));
    await again.init('2026-10-19');
    expect(await again.db.autoBackups.count()).toBe(1);
  });

  it('saves one copy when records are migrated in the same start, taken before either change', async () => {
    const tea = { id: 'l2', time: 2, day: '2026-10-01', label: 'Tea', kind: 'drink', drink: 'tea' };
    await version7Db('upgrade-backup-2', [oats, tea]);
    const repo = createRepo(new ToFooDB('upgrade-backup-2'));
    await repo.init('2026-10-18');
    const list = await repo.listAutoBackups();
    expect(list).toHaveLength(1);
    // The pre-release record is in the copy as it was, without the fields the migration adds.
    expect(JSON.parse(list[0]!.json).data.log).toContainEqual(tea);
  });

  it('saves a copy when the shopping list arrives (database version 8 to 9)', async () => {
    const old = new Dexie('upgrade-backup-3');
    old.version(8).stores({
      profile: 'id', settings: 'id', recipes: 'id, name, updatedAt', batches: 'id, recipeId, cookedDay', log: 'id, time, day, kind', customFoods: 'id, name',
      dayStatus: 'day', fasts: 'id, startDay', sunEntries: 'id, day', meta: 'key', products: 'id, name', journal: 'id, time, day', sleep: 'id, start, day',
      activities: 'id, time, day', water: 'id, time, day', chats: 'id, updatedAt', chatPhotos: 'id, chatId', autoBackups: 'id, at',
    });
    await old.open();
    await old.table('log').put(oats);
    old.close();
    const repo = createRepo(new ToFooDB('upgrade-backup-3'));
    await repo.init('2026-10-19');
    const list = await repo.listAutoBackups();
    expect(list.map((b) => b.reason)).toEqual(['upgrade']);
    expect(data(list[0]!.json)).toMatchObject({ log: [oats], shopping: [] });
    expect(await repo.db.shopping.count()).toBe(0);
  });

  it('saves a copy when the At home list arrives (database version 9 to 10)', async () => {
    const old = new Dexie('upgrade-backup-4');
    old.version(9).stores({
      profile: 'id', settings: 'id', recipes: 'id, name, updatedAt', batches: 'id, recipeId, cookedDay', log: 'id, time, day, kind', customFoods: 'id, name',
      dayStatus: 'day', fasts: 'id, startDay', sunEntries: 'id, day', meta: 'key', products: 'id, name', journal: 'id, time, day', sleep: 'id, start, day',
      activities: 'id, time, day', water: 'id, time, day', chats: 'id, updatedAt', chatPhotos: 'id, chatId', autoBackups: 'id, at', shopping: 'id, addedAt',
    });
    await old.open();
    await old.table('log').put(oats);
    old.close();
    const repo = createRepo(new ToFooDB('upgrade-backup-4'));
    await repo.init('2026-10-19');
    const list = await repo.listAutoBackups();
    expect(list.map((b) => b.reason)).toEqual(['upgrade']);
    expect(data(list[0]!.json)).toMatchObject({ log: [oats], shopping: [], pantry: [] });
    expect(await repo.db.pantry.count()).toBe(0);
  });

  it('saves nothing on a new phone', async () => {
    const repo = await fresh();
    expect(await repo.db.autoBackups.count()).toBe(0);
  });
});
