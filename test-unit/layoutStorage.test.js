const assert = require('assert');
const {
  extractEdgeRoutes,
  cleanupObsoleteEdgeRoutes,
  translateEdgeRoutesForMove,
  applySavedRoute,
} = require('../src/webview/utils/layoutStorage');

describe('layoutStorage edge routes', () => {
  it('extractEdgeRoutes omits edges with no override and no checkpoints', () => {
    const edges = [
      { data: { refKey: 'k-empty' } },
      { data: { refKey: 'k-side', sourceSide: 'left' } },
      { data: { refKey: 'k-cp', checkPoints: [{ x: 1, y: 2 }] } },
      { data: { refKey: 'k-both', sourceSide: 'right', targetSide: 'left', checkPoints: [{ x: 3, y: 4 }] } },
      { data: {} }, // no refKey -> skipped
      null,
    ];
    const routes = extractEdgeRoutes(edges);
    assert.deepStrictEqual(Object.keys(routes).sort(), ['k-both', 'k-cp', 'k-side']);
    assert.deepStrictEqual(routes['k-side'], { sourceSide: 'left' });
    assert.deepStrictEqual(routes['k-cp'], { checkPoints: [{ x: 1, y: 2 }] });
    assert.deepStrictEqual(routes['k-both'], { sourceSide: 'right', targetSide: 'left', checkPoints: [{ x: 3, y: 4 }] });
  });

  it('extractEdgeRoutes ignores invalid side values', () => {
    const routes = extractEdgeRoutes([{ data: { refKey: 'k', sourceSide: 'up' } }]);
    assert.deepStrictEqual(routes, {});
  });

  it('cleanupObsoleteEdgeRoutes drops obsolete keys and returns exactly the serialised map', () => {
    const saved = {
      a: { sourceSide: 'left' },
      b: { checkPoints: [{ x: 0, y: 0 }] },
      c: { targetSide: 'right' },
    };
    const cleaned = cleanupObsoleteEdgeRoutes(saved, ['a', 'c']);
    assert.deepStrictEqual(cleaned, { a: { sourceSide: 'left' }, c: { targetSide: 'right' } });
  });

  it('cleanupObsoleteEdgeRoutes tolerates a null saved map', () => {
    assert.deepStrictEqual(cleanupObsoleteEdgeRoutes(null, ['a']), {});
  });
});

describe('layoutStorage.applySavedRoute (transformer route seeding + escape hatches)', () => {
  it('ignores the whole route when endpoints do not resolve', () => {
    const seeded = applySavedRoute({ sourceSide: 'left', checkPoints: [{ x: 1, y: 2 }] }, false);
    assert.deepStrictEqual(seeded, { sourceSide: undefined, targetSide: undefined, checkPoints: undefined });
  });

  it('returns empty fields for a missing route', () => {
    assert.deepStrictEqual(applySavedRoute(undefined, true), { sourceSide: undefined, targetSide: undefined, checkPoints: undefined });
  });

  it('seeds valid side overrides and finite checkpoints', () => {
    const seeded = applySavedRoute({ sourceSide: 'left', targetSide: 'right', checkPoints: [{ x: 1, y: 2 }] }, true);
    assert.deepStrictEqual(seeded, { sourceSide: 'left', targetSide: 'right', checkPoints: [{ x: 1, y: 2 }] });
  });

  it('rejects invalid side values and drops non-finite checkpoints', () => {
    const seeded = applySavedRoute({
      sourceSide: 'up',
      checkPoints: [{ x: 1, y: 2 }, { x: NaN, y: 3 }, { x: 4, y: Infinity }],
    }, true);
    assert.strictEqual(seeded.sourceSide, undefined);
    assert.deepStrictEqual(seeded.checkPoints, [{ x: 1, y: 2 }]);
  });

  it('leaves checkPoints undefined when all points are non-finite', () => {
    const seeded = applySavedRoute({ checkPoints: [{ x: NaN, y: NaN }] }, true);
    assert.strictEqual(seeded.checkPoints, undefined);
  });
});

describe('layoutStorage.translateEdgeRoutesForMove', () => {
  const makeEdge = (refKey, sourceTable, targetTable, checkPoints) => ({
    data: { refKey, sourceTable, targetTable, checkPoints },
  });

  it('translates checkpoints only for edges whose BOTH endpoints moved', () => {
    const edges = [
      makeEdge('k1', 'A', 'B', [{ x: 10, y: 20 }]),      // both moved
      makeEdge('k2', 'A', 'C', [{ x: 5, y: 5 }]),        // only A moved
      makeEdge('k3', 'A', 'B', []),                      // no checkpoints
    ];
    const moved = new Set(['table-A', 'table-B']);
    const { nextEdges, nextRoutes, edgesChanged } = translateEdgeRoutesForMove(edges, {}, moved, 100, 200);

    assert.strictEqual(edgesChanged, true);
    assert.deepStrictEqual(nextEdges[0].data.checkPoints, [{ x: 110, y: 220 }]);
    // untouched edges keep their identity and points
    assert.strictEqual(nextEdges[1], edges[1]);
    assert.strictEqual(nextEdges[2], edges[2]);
    assert.deepStrictEqual(nextRoutes, { k1: { checkPoints: [{ x: 110, y: 220 }] } });
  });

  it('preserves existing side overrides in the route entry it updates', () => {
    const edges = [makeEdge('k1', 'A', 'B', [{ x: 0, y: 0 }])];
    const moved = new Set(['table-A', 'table-B']);
    const routes = { k1: { sourceSide: 'left', checkPoints: [{ x: 0, y: 0 }] } };
    const { nextRoutes } = translateEdgeRoutesForMove(edges, routes, moved, 5, -5);
    assert.deepStrictEqual(nextRoutes.k1, { sourceSide: 'left', checkPoints: [{ x: 5, y: -5 }] });
  });

  it('reports no change and does not mutate inputs when nothing qualifies', () => {
    const edges = [makeEdge('k1', 'A', 'C', [{ x: 1, y: 1 }])];
    const moved = new Set(['table-A', 'table-B']);
    const routes = { k1: { checkPoints: [{ x: 1, y: 1 }] } };
    const { nextEdges, edgesChanged } = translateEdgeRoutesForMove(edges, routes, moved, 9, 9);
    assert.strictEqual(edgesChanged, false);
    assert.strictEqual(nextEdges[0], edges[0]);
    assert.deepStrictEqual(routes, { k1: { checkPoints: [{ x: 1, y: 1 }] } });
  });
});
