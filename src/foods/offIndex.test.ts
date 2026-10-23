import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { decodeOffFile, listing, loadOffIndex, parseOffIndex, searchOffIndex } from './offIndex';
import { OFF_INDEX } from './offIndexInfo';

// Most-scanned first, as scripts/off-products.py writes it.
const TSV = [
  '# Open Food Facts products sold in Germany, 2026-10-23. Data: Open Food Facts contributors, ODbL.',
  '4000000000003\tWaffeln\tChoco Bros\t',
  '4017100406218\tPiCK UP ! Choco minis - 127g\tLeibniz, PiCK UP !\t127 g',
  '4008400121925\tGiotto\tFerrero\t38,7 g',
  '4017100285684\tPiCK UP!\tBahlsen\t28 g',
  '4017100270611\tPickUp\tBahlsen\t10 x 28 g',
  '4000000000001\tButterkeks\tLeibniz\t200 g',
  '4000000000002\tMüsliriegel Schoko\tKölln\t',
  '',
].join('\n');

const names = (q: string, opts?: Parameters<typeof searchOffIndex>[2]) => searchOffIndex(parseOffIndex(TSV), q, opts).map((r) => r.name);

describe('OFF product list', () => {
  it('parses rows and skips the header', () => {
    const index = parseOffIndex(TSV, '2026-10-23');
    expect(index.lines).toHaveLength(7);
    expect(listing(index.lines[2]!)).toEqual({ code: '4008400121925', name: 'Giotto', brand: 'Ferrero', quantity: '38,7 g' });
    expect(listing(index.lines[6]!).quantity).toBe('');
  });

  it('finds a product by words at word starts, in any case', () => {
    expect(names('pick up')).toEqual(['PiCK UP ! Choco minis - 127g', 'PiCK UP!', 'PickUp']);
    expect(names('giot')).toEqual(['Giotto']);
    expect(names('choco pick')).toEqual(['PiCK UP ! Choco minis - 127g']);
  });

  it('finds words run together or apart', () => {
    expect(names('pickup')).toEqual(['PickUp', 'PiCK UP ! Choco minis - 127g', 'PiCK UP!']);
  });

  it('puts products named with the words before those found by brand only', () => {
    expect(names('choco')).toEqual(['PiCK UP ! Choco minis - 127g', 'Waffeln']);
    expect(names('leibniz')).toEqual(['PiCK UP ! Choco minis - 127g', 'Butterkeks']);
    expect(names('butterkeks leibniz')).toEqual(['Butterkeks']);
  });

  it('ignores umlauts and punctuation', () => {
    expect(names('musliriegel')).toEqual(['Müsliriegel Schoko']);
    expect(names('kolln')).toEqual(['Müsliriegel Schoko']);
  });

  it('does not match inside words, and needs two letters', () => {
    expect(names('otto')).toEqual([]);
    expect(names('ckup')).toEqual([]);
    expect(names('p')).toEqual([]);
  });

  it('leaves out products already shown and respects the limit', () => {
    expect(names('pick up', { exclude: new Set(['4017100406218']) })).toEqual(['PiCK UP!', 'PickUp']);
    expect(names('pick up', { limit: 1 })).toHaveLength(1);
  });

  it('loads the gzipped file, or plain text when the server unpacked it', async () => {
    const gz = gzipSync(strToU8(TSV));
    const fake = (body: BodyInit) => (async () => new Response(body)) as unknown as typeof fetch;
    const a = await loadOffIndex('/base/', fake(gz));
    expect(a.lines).toHaveLength(7);
    expect(a.date).toBe(OFF_INDEX.date);
    expect(decodeOffFile(strToU8(TSV))).toBe(TSV);
  });

  it('ships the file the app asks for', () => {
    expect(existsSync(resolve(__dirname, '../../public', OFF_INDEX.file))).toBe(true);
  });
});
