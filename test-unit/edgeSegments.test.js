const assert = require('assert');
const {
  AXIS_EPS,
  MERGE_TOL,
  SAME_LINE_TOL,
  defaultInteriorPoints,
  buildRouteVertices,
  interiorOf,
  deriveSegments,
  slideSegment,
  splitSegment,
  splittableHalves,
  mergeRoute,
  toSegmentModel,
  buildRoundedPath,
  resetRoute,
} = require('../src/webview/utils/edgeSegments');

const GEO = {
  source: { x: 0, y: 0 }, sourceSide: 'right',
  target: { x: 200, y: 100 }, targetSide: 'left',
};

// Every consecutive pair of a full vertex list is axis-aligned, and no two
// consecutive segments share an orientation (strict alternation).
const assertAlternating = (v) => {
  for (let i = 0; i < v.length - 1; i++) {
    const a = v[i], b = v[i + 1];
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
    assert.ok(dx <= AXIS_EPS || dy <= AXIS_EPS, `segment ${i} is axis-aligned`);
  }
};

describe('edgeSegments.defaultInteriorPoints', () => {
  it('produces one vertical crossbar (two corners) between two rows', () => {
    const pts = defaultInteriorPoints(GEO);
    assert.strictEqual(pts.length, 2);
    assert.strictEqual(pts[0].x, pts[1].x, 'the crossbar is vertical');
    assert.strictEqual(pts[0].y, GEO.source.y);
    assert.strictEqual(pts[1].y, GEO.target.y);
  });
  it('is a single straight segment (no corner) when the ends share a row', () => {
    const pts = defaultInteriorPoints({ ...GEO, target: { x: 200, y: 0 } });
    assert.deepStrictEqual(pts, []);
  });
  it('D7: the crossbar x is the midpoint of the two CONNECTION POINTS, side-independent', () => {
    const a = defaultInteriorPoints({ source: { x: 100, y: 0 }, sourceSide: 'right', target: { x: 300, y: 50 }, targetSide: 'left' });
    assert.strictEqual(a[0].x, 200);
    // Same endpoints, both on the right side: the crossbar does not shift.
    const b = defaultInteriorPoints({ source: { x: 100, y: 0 }, sourceSide: 'right', target: { x: 300, y: 50 }, targetSide: 'right' });
    assert.strictEqual(b[0].x, 200);
  });
  it('D8: rows within 1px collapse to one segment; beyond 1px they do not', () => {
    assert.strictEqual(SAME_LINE_TOL, 1);
    assert.deepStrictEqual(defaultInteriorPoints({ source: { x: 0, y: 0 }, target: { x: 200, y: 1 } }), []);
    assert.deepStrictEqual(defaultInteriorPoints({ source: { x: 0, y: 0 }, target: { x: 200, y: 0.4 } }), []);
    assert.strictEqual(defaultInteriorPoints({ source: { x: 0, y: 0 }, target: { x: 200, y: 1.5 } }).length, 2);
  });
});

describe('edgeSegments.deriveSegments — pinned first/last (D2)', () => {
  const verts = buildRouteVertices(GEO);
  const segs = deriveSegments(verts);

  it('the default route is source -> corner -> corner -> target (H,V,H)', () => {
    assert.strictEqual(verts.length, 4);
    assertAlternating(verts);
    assert.deepStrictEqual(segs.map(s => s.orientation), ['h', 'v', 'h']);
  });
  it('marks the first and last segments pinned and not movable', () => {
    assert.strictEqual(segs[0].pinned, true);
    assert.strictEqual(segs[0].movable, false);
    assert.strictEqual(segs[segs.length - 1].pinned, true);
    assert.strictEqual(segs[segs.length - 1].movable, false);
  });
  it('marks exactly the interior crossbar movable', () => {
    const movable = segs.filter(s => s.movable);
    assert.strictEqual(movable.length, 1);
    assert.strictEqual(movable[0].orientation, 'v');
    assert.strictEqual(movable[0].axis, 'x');
  });
});

describe('edgeSegments.slideSegment — perpendicular move only', () => {
  it('slides a vertical segment along x, leaving every y untouched', () => {
    const verts = buildRouteVertices(GEO);
    const before = verts.map(p => p.y);
    const moved = slideSegment(verts, 1, { x: 130, y: 999 });
    assert.strictEqual(moved[1].x, 130);
    assert.strictEqual(moved[2].x, 130);
    assert.deepStrictEqual(moved.map(p => p.y), before, 'no y changed — one axis only');
  });
  it('refuses to move either pinned end segment (D2, first and last)', () => {
    const verts = buildRouteVertices(GEO); // 4 verts, segments 0,1,2 — 0 and 2 pinned
    assert.deepStrictEqual(slideSegment(verts, 0, { x: 5, y: 5 }), verts);
    assert.deepStrictEqual(slideSegment(verts, verts.length - 2, { x: 5, y: 5 }), verts);
  });
  it('keeps the endpoints fixed while an interior segment slides', () => {
    const verts = buildRouteVertices(GEO);
    const moved = slideSegment(verts, 1, { x: 55, y: 0 });
    assert.deepStrictEqual(moved[0], { x: 0, y: 0 });
    assert.deepStrictEqual(moved[moved.length - 1], { x: 200, y: 100 });
  });
  it('applies the drag as a delta so an off-segment grab does not teleport (BUG2)', () => {
    const verts = buildRouteVertices(GEO); // vertical segment 1 sits at x=100
    assert.strictEqual(verts[1].x, 100);
    // Grab 5px off the segment in x, then travel +30 in x.
    const grab = { x: 105, y: 50 };
    const moved = slideSegment(verts, 1, { x: 135, y: 50 }, grab);
    assert.strictEqual(moved[1].x, 130, 'moved by the +30 travel, not to the cursor');
    assert.strictEqual(moved[2].x, 130);
  });
  it('grabbing exactly on the segment behaves as the absolute cursor (BUG2)', () => {
    const verts = buildRouteVertices(GEO);
    const onSeg = slideSegment(verts, 1, { x: 140, y: 50 }, { x: 100, y: 50 });
    assert.strictEqual(onSeg[1].x, 140);
    // Omitting the grab keeps the prior absolute behaviour.
    const noGrab = slideSegment(verts, 1, { x: 140, y: 50 });
    assert.strictEqual(noGrab[1].x, 140);
  });
});

describe('edgeSegments.splitSegment (D1)', () => {
  it('inserts two vertices and stays a clean alternation, endpoints fixed', () => {
    const verts = buildRouteVertices(GEO); // 4 verts
    const { vertices, index } = splitSegment(verts, 0, { x: 10, y: 40 });
    assert.strictEqual(vertices.length, verts.length + 2);
    assertAlternating(vertices);
    assert.deepStrictEqual(vertices[0], { x: 0, y: 0 });
    assert.deepStrictEqual(vertices[vertices.length - 1], { x: 200, y: 100 });
    // The returned index names the sub-segment PARALLEL to the one split (same
    // orientation), so a continued drag keeps holding it.
    const seg = deriveSegments(vertices)[index];
    assert.strictEqual(seg.orientation, 'h', 'the held sub-segment is parallel to the split');
  });
  it('cuts at the segment midpoint, not where the soft point sits', () => {
    const verts = buildRouteVertices(GEO);
    const seg = deriveSegments(verts).find(sg => sg.movable);
    const midBefore = { x: seg.mid.x, y: seg.mid.y };
    const { vertices } = splitSegment(verts, seg.index, 'second');
    // Two vertices are inserted, both exactly at the midpoint — the cut point is
    // never the 25%/75% grab handle.
    assert.strictEqual(vertices.length, verts.length + 2);
    assert.ok(Math.abs(vertices[seg.index + 1].x - midBefore.x) <= AXIS_EPS, 'cut x is the midpoint');
    assert.ok(Math.abs(vertices[seg.index + 1].y - midBefore.y) <= AXIS_EPS, 'cut y is the midpoint');
  });

  it('hands back the grabbed half, parallel to the segment that was split', () => {
    const verts = buildRouteVertices(GEO);
    const seg = deriveSegments(verts).find(sg => sg.movable);
    ['first', 'second'].forEach(half => {
      const r = splitSegment(verts, seg.index, half);
      const grabbed = deriveSegments(r.vertices)[r.index];
      assert.strictEqual(grabbed.orientation, seg.orientation, half + ' half keeps the orientation');
    });
  });

  it('refuses the endpoint-side half of a pinned segment', () => {
    const verts = buildRouteVertices(GEO);
    const n = verts.length;
    assert.deepStrictEqual(splittableHalves(verts, 0), ['second']);
    assert.deepStrictEqual(splittableHalves(verts, n - 2), ['first']);
    // Asking for the pinned half changes nothing at all.
    assert.deepStrictEqual(splitSegment(verts, 0, 'first').vertices, verts);
    assert.deepStrictEqual(splitSegment(verts, n - 2, 'second').vertices, verts);
  });

  it('offers both halves of an interior segment', () => {
    const verts = buildRouteVertices(GEO);
    const seg = deriveSegments(verts).find(sg => sg.movable);
    assert.deepStrictEqual(splittableHalves(verts, seg.index), ['first', 'second']);
  });

  it('splits a straight run (both ends pinned) into a notch centred on the midpoint', () => {
    const straight = buildRouteVertices({ source: { x: 0, y: 0 }, sourceSide: 'right', target: { x: 200, y: 0 }, targetSide: 'left' });
    assert.strictEqual(straight.length, 2);
    const { vertices, index } = splitSegment(straight, 0, 'second');
    assertAlternating(vertices);
    assert.deepStrictEqual(vertices[0], { x: 0, y: 0 }, 'source held');
    assert.deepStrictEqual(vertices[vertices.length - 1], { x: 200, y: 0 }, 'target held');
    // Neither half of a doubly pinned run can move, so a notch is cut instead:
    // four vertices at the quarter points, leaving a movable centre.
    assert.strictEqual(vertices.length, 6);
    assert.ok(Math.abs(vertices[1].x - 50) <= AXIS_EPS, 'notch starts at 25%');
    assert.ok(Math.abs(vertices[4].x - 150) <= AXIS_EPS, 'notch ends at 75%');
    const grabbed = deriveSegments(vertices)[index];
    assert.ok(grabbed, 'a grabbed segment is returned');
    assert.strictEqual(grabbed.orientation, 'h', 'the movable centre is parallel to the run');
  });
});

describe('edgeSegments.splitSegment returns the PARALLEL sub-segment (BUG1)', () => {
  // For each split branch: the returned index names a segment with the SAME
  // orientation as the one that was split, and a further drag in the original
  // direction keeps moving that segment (it does not read the wrong axis).
  const offsetOf = (v, i) => {
    const s = deriveSegments(v)[i];
    return s.orientation === 'v' ? s.a.x : s.a.y;
  };
  const check = (label, verts, splitIndex, cursor, axis) => {
    it(label, () => {
      const splitOrient = deriveSegments(verts)[splitIndex].orientation;
      const { vertices, index } = splitSegment(verts, splitIndex, cursor);
      const heldOrient = deriveSegments(vertices)[index].orientation;
      assert.strictEqual(heldOrient, splitOrient, 'held sub-segment is parallel to the split');
      // Continue the drag further in the same axis; grab resets to the split
      // cursor (as the gesture does). The held segment must keep moving.
      const before = offsetOf(vertices, index);
      const cursor2 = axis === 'y' ? { x: cursor.x, y: cursor.y + 80 } : { x: cursor.x + 80, y: cursor.y };
      const moved = slideSegment(vertices, index, cursor2, cursor);
      const after = offsetOf(moved, index);
      assert.ok(Math.abs(after - before - 80) < 0.001, `held segment tracked the +80 ${axis} drag`);
    });
  };

  // 1) interior HORIZONTAL segment (the reviewer's exact reproduction).
  check('horizontal interior segment',
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 200 }, { x: 500, y: 200 }],
    2, { x: 250, y: 220 }, 'y');
  // 2) HORIZONTAL last segment (target pinned): near corner rides the drag.
  check('horizontal last segment',
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }],
    2, { x: 150, y: 160 }, 'y');
  // 3) interior VERTICAL segment.
  check('vertical interior segment',
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }],
    1, { x: 160, y: 50 }, 'x');
  // 4) VERTICAL last segment (target pinned).
  check('vertical last segment',
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
    1, { x: 160, y: 50 }, 'x');
  // 5) both-ends-pinned straight HORIZONTAL run (notch).
  check('both-pinned horizontal run',
    [{ x: 0, y: 0 }, { x: 200, y: 0 }],
    0, { x: 100, y: 60 }, 'y');
  // 6) both-ends-pinned straight VERTICAL run (notch).
  check('both-pinned vertical run',
    [{ x: 0, y: 0 }, { x: 0, y: 200 }],
    0, { x: 60, y: 100 }, 'x');
});

describe('edgeSegments.resetRoute (D5)', () => {
  it('clears both endpoint-side overrides and every segment corner', () => {
    const r = resetRoute();
    assert.strictEqual(r.sourceSide, undefined);
    assert.strictEqual(r.targetSide, undefined);
    assert.ok(!r.checkPoints || r.checkPoints.length === 0);
  });
  it('a route rebuilt from the reset state is the automatic default (D7)', () => {
    const verts = buildRouteVertices({ ...GEO, checkPoints: resetRoute().checkPoints });
    assert.deepStrictEqual(interiorOf(verts), defaultInteriorPoints(GEO));
  });
});

describe('edgeSegments — endpoints are immutable across every operation (C2/D2)', () => {
  const ep = (v) => [{ ...v[0] }, { ...v[v.length - 1] }];
  const assertEndpointsHeld = (before, after, msg) => {
    assert.deepStrictEqual(after[0], before[0], `${msg}: source held`);
    assert.deepStrictEqual(after[after.length - 1], before[before.length - 1], `${msg}: target held`);
  };

  it('a merge adjacent to the TARGET never moves the target (the reviewer C2 case)', () => {
    const v = [
      { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 95 },
      { x: 100, y: 95 }, { x: 100, y: 100 }, { x: 200, y: 100 },
    ];
    const merged = mergeRoute(v);
    assert.deepStrictEqual(merged[merged.length - 1], { x: 200, y: 100 }, 'target byte-identical');
    assert.ok(merged.length < v.length, 'the jog still collapses');
    assertAlternating(merged);
    // The last segment stays horizontal, entering the endpoint on its row.
    const segs = deriveSegments(merged);
    assert.strictEqual(segs[segs.length - 1].orientation, 'h');
  });

  it('a merge adjacent to the SOURCE never moves the source (mirror case)', () => {
    const v = [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 5 },
      { x: 150, y: 5 }, { x: 150, y: 100 }, { x: 200, y: 100 },
    ];
    const merged = mergeRoute(v);
    assert.deepStrictEqual(merged[0], { x: 0, y: 0 }, 'source byte-identical');
    assertAlternating(merged);
    assert.strictEqual(deriveSegments(merged)[0].orientation, 'h');
  });

  it('slide, split and merge all hold both endpoints for a range of inputs', () => {
    const bases = [
      buildRouteVertices(GEO),
      buildRouteVertices({ source: { x: 300, y: 20 }, sourceSide: 'left', target: { x: -40, y: 260 }, targetSide: 'right' }),
      [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 95 }, { x: 100, y: 95 }, { x: 100, y: 100 }, { x: 200, y: 100 }],
    ];
    bases.forEach((verts, bi) => {
      const before = ep(verts);
      assertEndpointsHeld(before, ep(mergeRoute(verts)), `merge#${bi}`);
      for (let idx = 0; idx < verts.length - 1; idx++) {
        assertEndpointsHeld(before, ep(slideSegment(verts, idx, { x: 12, y: 34 })), `slide#${bi}.${idx}`);
        assertEndpointsHeld(before, ep(splitSegment(verts, idx, { x: 15, y: 40 }).vertices), `split#${bi}.${idx}`);
      }
    });
  });
});

describe('edgeSegments.mergeRoute (D4)', () => {
  it('collapses a short jog between two parallel segments and drops two vertices', () => {
    // Two verticals (x=100 and x=100+tol/2) joined by a sub-tolerance connector.
    const v = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 100 + MERGE_TOL / 2, y: 50 },
      { x: 100 + MERGE_TOL / 2, y: 100 },
      { x: 200, y: 100 },
    ];
    const merged = mergeRoute(v);
    assert.ok(merged.length < v.length, 'vertices dropped');
    assertAlternating(merged);
    // The two verticals became one straight vertical.
    assert.strictEqual(merged.length, 4);
  });
  it('leaves a genuine jog (connector above tolerance) intact', () => {
    const v = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 140, y: 50 },
      { x: 140, y: 100 },
      { x: 200, y: 100 },
    ];
    assert.strictEqual(mergeRoute(v).length, v.length);
  });
  it('is idempotent', () => {
    const v = [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 },
      { x: 103, y: 50 }, { x: 103, y: 100 }, { x: 200, y: 100 },
    ];
    const once = mergeRoute(v);
    assert.deepStrictEqual(mergeRoute(once), once);
  });
  it('a slide into alignment then merge yields fewer interior corners', () => {
    // A four-corner route with two verticals; slide the second onto the first.
    const verts = [
      { x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 50 },
      { x: 140, y: 50 }, { x: 140, y: 100 }, { x: 200, y: 100 },
    ];
    const before = interiorOf(verts).length; // 4
    const slid = slideSegment(verts, 3, { x: 80 + MERGE_TOL / 2, y: 0 }); // move x=140 vertical near x=80
    const merged = mergeRoute(slid);
    assert.ok(interiorOf(merged).length < before, 'merge dropped corners');
    assertAlternating(merged);
  });
});

describe('edgeSegments.toSegmentModel — legacy conversion (section 5)', () => {
  // The real 8-point knot from Restaurant.dbml.layout.json (free-point era),
  // two of whose points differ by 0.67px in x.
  const KNOT = [
    { x: 832.6741673652294, y: 126.95097979888264 },
    { x: 780.2937730169547, y: 228.7468357711896 },
    { x: 733.9885136912962, y: 278.00458294562816 },
    { x: 733.3182683747672, y: 227.06515479733608 },
    { x: 553.5930142817184, y: 227.0175859395432 },
    { x: 330.11474884993675, y: 390.2981190772308 },
    { x: 271.53551439854346, y: 124.18101052914572 },
    { x: -125.54006832094746, y: 360.1280451851131 },
  ];
  const ANCHORS = { source: { x: 744.84, y: 0 }, target: { x: -69.10, y: 441.34 } };

  it('renders the legacy knot as a clean axis-aligned alternation', () => {
    const interior = toSegmentModel(KNOT, ANCHORS);
    const full = [ANCHORS.source, ...interior, ANCHORS.target];
    assertAlternating(full);
  });
  it('C9: forces horizontal endpoint legs even when a legacy gap is already vertical', () => {
    // Reviewer case: first checkpoint shares the source x, last shares the target
    // x, so the naive conversion left a vertical first AND last leg (V-H-V).
    const source = { x: 0, y: 0 };
    const target = { x: 100, y: 100 };
    const interior = toSegmentModel([{ x: 0, y: 50 }, { x: 100, y: 50 }], { source, target });
    const full = [source, ...interior, target];
    assertAlternating(full);
    const segs = deriveSegments(full);
    assert.strictEqual(segs[0].orientation, 'h', 'first leg horizontal');
    assert.strictEqual(segs[segs.length - 1].orientation, 'h', 'last leg horizontal');
    assert.deepStrictEqual(full[0], { x: 0, y: 0 }, 'source held');
    assert.deepStrictEqual(full[full.length - 1], { x: 100, y: 100 }, 'target held');
  });
  it('C3: the converted knot leaves the source and enters the target horizontally', () => {
    const interior = toSegmentModel(KNOT, ANCHORS);
    const segs = deriveSegments([ANCHORS.source, ...interior, ANCHORS.target]);
    assert.strictEqual(segs[0].orientation, 'h', 'first (pinned) leg horizontal');
    assert.strictEqual(segs[segs.length - 1].orientation, 'h', 'last (pinned) leg horizontal');
    // The last vertex before the target sits on the target row, not its column.
    assert.ok(Math.abs(interior[interior.length - 1].y - ANCHORS.target.y) <= AXIS_EPS);
  });
  it('is idempotent, so a converted route never drifts once re-fed', () => {
    const once = toSegmentModel(KNOT, ANCHORS);
    const twice = toSegmentModel(once, ANCHORS);
    assert.deepStrictEqual(twice, once);
  });
  it('a route already in the model passes through unchanged', () => {
    const clean = defaultInteriorPoints(GEO);
    assert.deepStrictEqual(toSegmentModel(clean, GEO), clean);
  });
  it('drops a redundant collinear corner', () => {
    const collinear = [{ x: 150, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }];
    assert.ok(toSegmentModel(collinear, GEO).length < collinear.length);
  });
  it('ignores non-finite points rather than emitting NaN geometry', () => {
    const out = toSegmentModel([{ x: 50, y: 0 }, { x: NaN, y: 10 }, { x: 50, y: 100 }], GEO);
    out.forEach(p => { assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)); });
  });
});

describe('edgeSegments.buildRoundedPath', () => {
  it('starts at the source, ends at the target, and rounds interior corners', () => {
    const { d } = buildRoundedPath(buildRouteVertices(GEO));
    assert.ok(d.startsWith('M 0,0'));
    assert.ok(d.includes('Q'), 'rounded corners present');
    assert.ok(d.trim().endsWith('L 200,100'));
  });
  it('clamps the corner radius on short segments (no NaN)', () => {
    const verts = buildRouteVertices({
      source: { x: 0, y: 0 }, sourceSide: 'right',
      target: { x: 25, y: 4 }, targetSide: 'left',
    });
    assert.ok(!/NaN/.test(buildRoundedPath(verts).d));
  });
});
