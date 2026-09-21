const assert = require('assert');
const { mergeColumnRole } = require('../src/webview/utils/dbmlTransformer');

describe('dbmlTransformer.mergeColumnRole', () => {
  it('seeds a source-only record when none exists', () => {
    const r = mergeColumnRole(undefined, { isSource: true, isTarget: false, relation: '*' });
    assert.strictEqual(r.isSource, true);
    assert.strictEqual(r.isTarget, false);
    assert.strictEqual(r.sourceRelation, '*');
  });

  it('seeds a target-only record when none exists', () => {
    const r = mergeColumnRole(undefined, { isSource: false, isTarget: true, relation: '1' });
    assert.strictEqual(r.isSource, false);
    assert.strictEqual(r.isTarget, true);
    assert.strictEqual(r.targetRelation, '1');
  });

  it('merges a target role into an existing source record (dual-role column keeps both)', () => {
    const source = mergeColumnRole(undefined, { isSource: true, isTarget: false, relation: '*' });
    const both = mergeColumnRole(source, { isSource: false, isTarget: true, relation: '1' });
    assert.strictEqual(both.isSource, true, 'source role preserved');
    assert.strictEqual(both.isTarget, true, 'target role added');
    assert.strictEqual(both.sourceRelation, '*');
    assert.strictEqual(both.targetRelation, '1');
  });

  it('merges a source role into an existing target record symmetrically', () => {
    const target = mergeColumnRole(undefined, { isSource: false, isTarget: true, relation: '1' });
    const both = mergeColumnRole(target, { isSource: true, isTarget: false, relation: '*' });
    assert.strictEqual(both.isSource, true);
    assert.strictEqual(both.isTarget, true);
    assert.strictEqual(both.sourceRelation, '*');
    assert.strictEqual(both.targetRelation, '1');
  });

  it('does not mutate the existing record', () => {
    const source = mergeColumnRole(undefined, { isSource: true, isTarget: false, relation: '*' });
    const snapshot = { ...source };
    mergeColumnRole(source, { isSource: false, isTarget: true, relation: '1' });
    assert.deepStrictEqual(source, snapshot);
  });
});
