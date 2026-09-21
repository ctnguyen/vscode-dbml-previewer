const assert = require('assert');
const { sideForPoint, nearestSide, sidesFavouredByRoute, SIDE_MARGIN } = require('../src/webview/utils/edgeSides');

const table = { x: 1000, width: 200 }; // spans 1000..1200

describe('edgeSides.sideForPoint', () => {
  it('claims left only well clear of the left edge', () => {
    assert.strictEqual(sideForPoint(1000 - SIDE_MARGIN - 1, table), 'left');
    assert.strictEqual(sideForPoint(1000 - SIDE_MARGIN + 1, table), null);
  });

  it('claims right only well clear of the right edge', () => {
    assert.strictEqual(sideForPoint(1200 + SIDE_MARGIN + 1, table), 'right');
    assert.strictEqual(sideForPoint(1200 + SIDE_MARGIN - 1, table), null);
  });

  it('is undecided over the table itself', () => {
    assert.strictEqual(sideForPoint(1100, table), null);
  });

  it('is undecided when the table or point is unknown', () => {
    assert.strictEqual(sideForPoint(10, undefined), null);
    assert.strictEqual(sideForPoint(NaN, table), null);
  });
});

describe('edgeSides.nearestSide', () => {
  it('always commits to a side, split at the table centre', () => {
    assert.strictEqual(nearestSide(1099, table), 'left');
    assert.strictEqual(nearestSide(1101, table), 'right');
    assert.strictEqual(nearestSide(1100, table), 'right');
  });

  it('still answers for a point over the table', () => {
    assert.strictEqual(nearestSide(1005, table), 'left');
  });

  it('returns null only without a table', () => {
    assert.strictEqual(nearestSide(5, null), null);
  });
});

describe('edgeSides.sidesFavouredByRoute', () => {
  const sourceTable = { x: 1000, width: 200 };
  const targetTable = { x: 2000, width: 200 };

  it('reads the waypoint nearest each end', () => {
    const r = sidesFavouredByRoute({
      checkPoints: [{ x: 900, y: 0 }, { x: 2400, y: 50 }],
      sourceTable, targetTable,
    });
    assert.deepStrictEqual(r, { sourceSide: 'left', targetSide: 'right' });
  });

  it('leaves an endpoint alone when its nearest waypoint is not clearly outside', () => {
    const r = sidesFavouredByRoute({
      checkPoints: [{ x: 1100, y: 0 }, { x: 2100, y: 0 }],
      sourceTable, targetTable,
    });
    assert.deepStrictEqual(r, { sourceSide: null, targetSide: null });
  });

  it('uses the single waypoint for both ends when there is only one', () => {
    const r = sidesFavouredByRoute({
      checkPoints: [{ x: 900, y: 0 }],
      sourceTable, targetTable,
    });
    assert.strictEqual(r.sourceSide, 'left');
    assert.strictEqual(r.targetSide, 'left');
  });

  it('ignores non-finite points and an empty route', () => {
    assert.deepStrictEqual(
      sidesFavouredByRoute({ checkPoints: [], sourceTable, targetTable }),
      { sourceSide: null, targetSide: null });
    assert.deepStrictEqual(
      sidesFavouredByRoute({ checkPoints: [{ x: NaN, y: 1 }], sourceTable, targetTable }),
      { sourceSide: null, targetSide: null });
  });
});
