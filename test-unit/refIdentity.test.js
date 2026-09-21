const assert = require('assert');
const {
  refBaseKey,
  refKey,
  makeOccurrenceCounter,
  currentRefKeysFromEdges,
} = require('../src/webview/utils/refIdentity');

describe('refIdentity', () => {
  const refA = {
    srcSchema: 'public', srcTable: 'orders', srcFields: ['user_id'],
    tgtSchema: 'public', tgtTable: 'users', tgtFields: ['id'],
  };

  it('base is content-derived, so reordering/inserting/removing other Refs cannot change it', () => {
    // The base never takes an ordinal position, so an identical Ref always maps
    // to the same base regardless of how many other Refs precede or follow it.
    assert.strictEqual(refBaseKey(refA), refBaseKey({ ...refA }));
  });

  it('single-schema key equals multi-schema key (schema always present, default public)', () => {
    const withSchema = refBaseKey({ ...refA, srcSchema: 'public', tgtSchema: 'public' });
    const withoutSchema = refBaseKey({ ...refA, srcSchema: undefined, tgtSchema: undefined });
    assert.strictEqual(withSchema, withoutSchema);
  });

  it('composite FK base contains both complete field arrays', () => {
    const composite = refBaseKey({
      srcSchema: 'public', srcTable: 'a', srcFields: ['f1', 'f2'],
      tgtSchema: 'public', tgtTable: 'b', tgtFields: ['g1', 'g2'],
    });
    assert.ok(composite.includes('f1,f2'), 'source field array present');
    assert.ok(composite.includes('g1,g2'), 'target field array present');
  });

  it('per-line suffix is distinct per field pair', () => {
    const base = refBaseKey(refA);
    const k1 = refKey(base, 'f1', 'g1');
    const k2 = refKey(base, 'f2', 'g2');
    assert.notStrictEqual(k1, k2);
    assert.ok(k1.startsWith(base + '::'));
  });

  it('renaming a referenced table or column changes the key', () => {
    const base = refBaseKey(refA);
    assert.notStrictEqual(base, refBaseKey({ ...refA, tgtTable: 'people' }));
    assert.notStrictEqual(base, refBaseKey({ ...refA, srcFields: ['owner_id'] }));
  });

  it('makeOccurrenceCounter yields 0,1,2 for repeated bases', () => {
    const counter = makeOccurrenceCounter();
    const base = refBaseKey(refA);
    assert.strictEqual(counter(base), 0);
    assert.strictEqual(counter(base), 1);
    assert.strictEqual(counter(base), 2);
    assert.strictEqual(counter('a-different-base'), 0);
  });

  it('occurrence > 0 disambiguates byte-identical duplicate Refs', () => {
    const first = refBaseKey({ ...refA, occurrence: 0 });
    const second = refBaseKey({ ...refA, occurrence: 1 });
    assert.notStrictEqual(first, second);
    assert.ok(second.endsWith('#1'));
  });

  it('currentRefKeysFromEdges drops undefined refKeys and null edges', () => {
    const edges = [
      { data: { refKey: 'k1' } },
      { data: {} },
      null,
      { data: { refKey: 'k2' } },
    ];
    assert.deepStrictEqual(currentRefKeysFromEdges(edges), ['k1', 'k2']);
  });
});
