import { describe, expect, it } from 'vitest';
import { kitchenNote } from './kitchen';

describe('the kitchen as the assistant is told', () => {
  const things = [
    { name: 'Oats', place: 'cupboard', left: '350 g', food: 'BLS:C133000 Oat flakes' },
    { name: 'Lasagne', place: 'freezer', left: '2 left', status: 'low', food: 'OFF:123 Lasagne (Iglo)' },
    { name: 'Cumin', place: 'spices', left: '' },
    { name: 'Milk', place: 'fridge', left: '', status: 'out', food: 'BLS:M111000 Milk' },
  ] as const;

  it('lists only the ticked places, in kitchen order, and names the ones left out', () => {
    const note = kitchenNote(['cupboard', 'fridge', 'freezer'], things);
    expect(note).toContain('in these places: fridge, freezer, cupboard (not spices: draw no conclusions about those)');
    expect(note).toContain('3 things');
    const lines = note.trim().split('\n').slice(1);
    expect(lines).toEqual(['fridge | Milk | have it (used up) | BLS:M111000 Milk', 'freezer | Lasagne | 2 left (running low) | OFF:123 Lasagne (Iglo)', 'cupboard | Oats | 350 g | BLS:C133000 Oat flakes']);
    expect(note).not.toContain('Cumin');
  });

  it('says so when the ticked places are empty, and names nothing left out when all are ticked', () => {
    expect(kitchenNote(['spices'], [])).toContain('There is nothing there.');
    const all = kitchenNote(['fridge', 'freezer', 'cupboard', 'spices'], things);
    expect(all).not.toContain('(not ');
    expect(all).toContain('spices | Cumin | have it | no food linked');
  });
});
