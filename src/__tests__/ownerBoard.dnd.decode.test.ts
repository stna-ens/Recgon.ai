// Phase 3.5 / Plan 03.5-03 — drop-target id decoder unit tests.
//
// The OwnerWorkloadBoard exports `decodeDropTarget(id)` which converts dnd-kit
// drop-target ids into structured objects. Each shape locks a contract used
// by the onDragEnd handler.

import { describe, it, expect } from 'vitest';
import { decodeDropTarget } from '@/app/projects/OwnerWorkloadBoard';

describe('decodeDropTarget', () => {
  it('decodes a cell drop "{teammateId}__{dateISO}"', () => {
    expect(decodeDropTarget('tm-alice__2026-05-19')).toEqual({
      kind: 'cell',
      teammateId: 'tm-alice',
      dateISO: '2026-05-19',
    });
    expect(decodeDropTarget('tm-bob__2026-12-31')).toEqual({
      kind: 'cell',
      teammateId: 'tm-bob',
      dateISO: '2026-12-31',
    });
  });

  it('decodes a lane drop "{teammateId}__lane"', () => {
    expect(decodeDropTarget('tm-alice__lane')).toEqual({
      kind: 'lane',
      teammateId: 'tm-alice',
    });
  });

  it('handles teammate ids with embedded underscores (greedy match on prefix)', () => {
    // Cell decode regex is greedy on the prefix — "complex_id__2026-05-19"
    // → teammateId = "complex_id".
    expect(decodeDropTarget('complex_id__2026-05-19')).toEqual({
      kind: 'cell',
      teammateId: 'complex_id',
      dateISO: '2026-05-19',
    });
    // Lane match is non-greedy on the suffix "__lane".
    expect(decodeDropTarget('complex_id__lane')).toEqual({
      kind: 'lane',
      teammateId: 'complex_id',
    });
  });

  it('returns null for unrecognized ids', () => {
    expect(decodeDropTarget('garbage')).toBeNull();
    expect(decodeDropTarget('tm-alice__notadate')).toBeNull();
    // 'dock' (reverse-drag) is explicitly ignored in v1.
    expect(decodeDropTarget('dock')).toBeNull();
  });
});
