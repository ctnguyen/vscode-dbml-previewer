const assert = require('assert');
const { parseLayoutFile, resolvePendingEdges } = require('../src/layout/layoutFile');

describe('layoutFile.parseLayoutFile', () => {
  it('returns {positions, edges} for a valid v1 file without an edges key', () => {
    const text = JSON.stringify({ version: 1, positions: { 'table-a': { x: 1, y: 2 } } });
    assert.deepStrictEqual(parseLayoutFile(text), {
      positions: { 'table-a': { x: 1, y: 2 } },
      edges: {},
    });
  });

  it('returns {positions, edges} for a valid v1 file including an edges key', () => {
    const obj = {
      version: 1,
      positions: { 'table-a': { x: 1, y: 2 } },
      edges: { 'public.a(x)->public.b(y)::x->y': { sourceSide: 'left' } },
    };
    assert.deepStrictEqual(parseLayoutFile(JSON.stringify(obj)), {
      positions: obj.positions,
      edges: obj.edges,
    });
  });

  it('returns null for a wrong version', () => {
    assert.strictEqual(parseLayoutFile(JSON.stringify({ version: 2, positions: {} })), null);
  });

  it('returns null when positions are missing', () => {
    assert.strictEqual(parseLayoutFile(JSON.stringify({ version: 1 })), null);
  });

  it('returns null for malformed JSON', () => {
    assert.strictEqual(parseLayoutFile('{ not valid json'), null);
  });
});

describe('layoutFile.resolvePendingEdges (positions-only save keeps saved routes)', () => {
  const routes = { k: { sourceSide: 'left' } };

  it('keeps the pending routes when the incoming edges field is omitted', () => {
    assert.strictEqual(resolvePendingEdges(routes, undefined), routes);
  });

  it('replaces the pending routes with an explicit value (including {})', () => {
    const next = { k2: { targetSide: 'right' } };
    assert.strictEqual(resolvePendingEdges(routes, next), next);
    assert.deepStrictEqual(resolvePendingEdges(routes, {}), {});
  });
});
