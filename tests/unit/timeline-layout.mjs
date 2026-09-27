// Verification of src/views/timeline-layout.ts (the Timeline view's pure
// layout math). Imports the real TypeScript module under Node's built-in type
// stripping (Node >= 22.18) -- no hand-copied duplicate to drift out of sync,
// which is what the previous version of this file had to maintain.
// Run: node tests/unit/timeline-layout.mjs
import {
  LANE_GAP_PX,
  MIN_BAR_PX,
  PX_PER_HOUR,
  anchoredScrollLeft,
  axisTicks,
  layoutTimeline,
  monthRange,
  visibleBars,
} from '../../src/views/timeline-layout.ts';

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + extra}`);
  if (!cond) failures++;
};
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

const H = 3_600_000;
// September 2026, axis in floating wall-clock ms.
const range = monthRange(new Date(2026, 8, 15));
const px = PX_PER_HOUR.month;
const ev = (id, start, end, timezone = 'UTC') => ({ id, start_time: start, end_time: end, timezone });

// ---- geometry ---------------------------------------------------------------
{
  const { bars, totalWidth } = layoutTimeline(
    [ev('multi', '2026-09-10T18:00:00Z', '2026-09-13T14:00:00Z')],
    range.start, range.end, px,
  );
  check('September is 30 days wide at month zoom', totalWidth === 30 * 24 * px, String(totalWidth));
  const b = bars[0];
  check('a multi-day event is exactly one bar', bars.length === 1);
  check('the bar starts at its real start (Sep 10 18:00)', near(b.left, (9 * 24 + 18) * px), String(b.left));
  check('the bar spans its full duration (68h), continuously', near(b.width, 68 * px), String(b.width));
}

// ---- event timezone, not viewer/process timezone -----------------------------
{
  // 23:00Z on Sep 5 is 6:00 PM CDT. The bar must sit at the 18:00 mark of
  // Sep 5 on the event's own wall clock.
  const { bars } = layoutTimeline(
    [ev('chi', '2026-09-05T23:00:00Z', '2026-09-06T03:00:00Z', 'America/Chicago')],
    range.start, range.end, PX_PER_HOUR.day,
  );
  check('a Chicago 6pm event sits at 18:00 on its own wall clock',
    near(bars[0].left, (4 * 24 + 18) * PX_PER_HOUR.day), String(bars[0].left));
  check('its 4h duration is 4h wide', near(bars[0].width, 4 * PX_PER_HOUR.day), String(bars[0].width));
  // Arizona has no DST: 01:00Z Sep 6 = 6:00 PM MST Sep 5.
  const az = layoutTimeline([ev('az', '2026-09-06T01:00:00Z', '2026-09-06T03:00:00Z', 'America/Phoenix')],
    range.start, range.end, PX_PER_HOUR.day).bars[0];
  check('an Arizona (no-DST) 6pm event also sits at 18:00', near(az.left, (4 * 24 + 18) * PX_PER_HOUR.day), String(az.left));
  // An invalid zone falls back to UTC rather than throwing.
  const bad = layoutTimeline([ev('bad', '2026-09-05T18:00:00Z', '2026-09-05T19:00:00Z', 'Not/AZone')],
    range.start, range.end, px);
  check('an invalid zone does not throw and still lays out (UTC fallback)', bad.bars.length === 1);
}

// ---- lane stacking -------------------------------------------------------------
{
  const { bars, laneCount } = layoutTimeline([
    ev('a', '2026-09-05T10:00:00Z', '2026-09-05T14:00:00Z'),
    ev('b', '2026-09-05T12:00:00Z', '2026-09-05T16:00:00Z'), // overlaps a
    ev('c', '2026-09-05T13:00:00Z', '2026-09-05T15:00:00Z'), // overlaps a and b
  ], range.start, range.end, PX_PER_HOUR.day);
  const lanes = new Set(bars.map((b) => b.lane));
  check('three mutually overlapping same-day events take three lanes', laneCount === 3 && lanes.size === 3,
    JSON.stringify(bars.map((b) => [b.event.id, b.lane])));
}
{
  const { bars, laneCount } = layoutTimeline([
    ev('a', '2026-09-05T10:00:00Z', '2026-09-05T12:00:00Z'),
    ev('b', '2026-09-05T13:00:00Z', '2026-09-05T15:00:00Z'), // after a, same day
  ], range.start, range.end, PX_PER_HOUR.day);
  check('non-overlapping same-day events share one lane', laneCount === 1, JSON.stringify(bars.map((b) => b.lane)));
}
{
  // At month zoom a 15-minute event is 0.5px of real time; two of them 30
  // minutes apart don't overlap in time but would overlap on screen once
  // padded to MIN_BAR_PX -- they must not share a lane.
  const { bars, laneCount } = layoutTimeline([
    ev('t1', '2026-09-05T10:00:00Z', '2026-09-05T10:15:00Z'),
    ev('t2', '2026-09-05T10:30:00Z', '2026-09-05T10:45:00Z'),
  ], range.start, range.end, px);
  check('tiny events get the minimum clickable width', bars.every((b) => b.width >= MIN_BAR_PX));
  check('min-width padding pushes visually-colliding tiny events into separate lanes', laneCount === 2);
}
{
  // A long bar and a short one starting at the same instant: the long one
  // takes the top lane.
  const { bars } = layoutTimeline([
    ev('short', '2026-09-05T10:00:00Z', '2026-09-05T11:00:00Z'),
    ev('long', '2026-09-05T10:00:00Z', '2026-09-08T10:00:00Z'),
  ], range.start, range.end, px);
  check('on a start tie the longer bar takes lane 0', bars.find((b) => b.event.id === 'long').lane === 0);
}

// Randomized: no two bars in the same lane collide on screen, and lane count
// equals the true maximum overlap depth (greedy-by-start is optimal).
{
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  let collisions = 0;
  let suboptimal = 0;
  for (let trial = 0; trial < 50; trial++) {
    const events = Array.from({ length: 120 }, (_, i) => {
      const s = Date.UTC(2026, 8, 1) + Math.floor(rand() * 29 * 24) * H;
      const dur = (rand() < 0.15 ? 24 + rand() * 72 : 0.5 + rand() * 6) * H;
      return ev(`r${trial}-${i}`, new Date(s).toISOString(), new Date(s + dur).toISOString());
    });
    const { bars, laneCount } = layoutTimeline(events, range.start, range.end, px);
    const byLane = new Map();
    for (const b of bars) byLane.set(b.lane, [...(byLane.get(b.lane) ?? []), b]);
    for (const laneBars of byLane.values()) {
      laneBars.sort((a, b) => a.left - b.left);
      for (let i = 1; i < laneBars.length; i++) {
        if (laneBars[i - 1].left + laneBars[i - 1].width + LANE_GAP_PX > laneBars[i].left + 1e-9) collisions++;
      }
    }
    // Max overlap depth of the padded pixel intervals (sweep line).
    const pts = bars.flatMap((b) => [[b.left, 1], [b.left + b.width + LANE_GAP_PX, -1]]);
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let depth = 0, maxDepth = 0;
    for (const [, d] of pts) { depth += d; maxDepth = Math.max(maxDepth, depth); }
    if (laneCount !== maxDepth) suboptimal++;
  }
  check('randomized: no two bars in one lane ever collide (50 trials x 120 events)', collisions === 0, String(collisions));
  check('randomized: lane count always equals the true max overlap depth', suboptimal === 0, String(suboptimal));
}

// ---- range clipping -------------------------------------------------------------
{
  const { bars } = layoutTimeline([
    ev('spill-in', '2026-08-30T12:00:00Z', '2026-09-02T12:00:00Z'),
    ev('spill-out', '2026-09-29T12:00:00Z', '2026-10-03T12:00:00Z'),
    ev('outside', '2026-10-05T12:00:00Z', '2026-10-06T12:00:00Z'),
    ev('ends-at-start', '2026-08-31T12:00:00Z', '2026-09-01T00:00:00Z'),
  ], range.start, range.end, px);
  const byId = Object.fromEntries(bars.map((b) => [b.event.id, b]));
  check('an event entirely outside the month is excluded', !byId.outside);
  check('an event ending exactly at the month start is excluded', !byId['ends-at-start']);
  check('an event spilling in from last month is clipped at x=0 and flagged', byId['spill-in']?.left === 0 && byId['spill-in'].clippedStart);
  check('an event spilling into next month ends at the axis end and is flagged',
    near(byId['spill-out'].left + byId['spill-out'].width, 30 * 24 * px) && byId['spill-out'].clippedEnd);
}

// ---- zoom re-scaling ------------------------------------------------------------
{
  const e = [ev('z', '2026-09-12T09:30:00Z', '2026-09-14T17:00:00Z')];
  const m = layoutTimeline(e, range.start, range.end, PX_PER_HOUR.month).bars[0];
  const w = layoutTimeline(e, range.start, range.end, PX_PER_HOUR.week).bars[0];
  const d = layoutTimeline(e, range.start, range.end, PX_PER_HOUR.day).bars[0];
  const r1 = PX_PER_HOUR.week / PX_PER_HOUR.month;
  const r2 = PX_PER_HOUR.day / PX_PER_HOUR.month;
  check('zoom scales left and width by exactly the density ratio (week)', near(w.left, m.left * r1) && near(w.width, m.width * r1));
  check('zoom scales left and width by exactly the density ratio (day)', near(d.left, m.left * r2) && near(d.width, m.width * r2));
  // The same moment stays under the viewport centre across a zoom change.
  const vw = 1000;
  const oldLeft = 5000;
  const newLeft = anchoredScrollLeft(oldLeft, vw, PX_PER_HOUR.month, PX_PER_HOUR.day);
  const tOld = (oldLeft + vw / 2) / PX_PER_HOUR.month;
  const tNew = (newLeft + vw / 2) / PX_PER_HOUR.day;
  check('zooming keeps the centre moment fixed', near(tOld, tNew), `${tOld}h vs ${tNew}h`);
  check('zoom anchor never produces a negative scrollLeft', anchoredScrollLeft(0, 1000, 64, 2) === 0);
}

// ---- ticks line up with bars --------------------------------------------------------
{
  const month = axisTicks(range.start, range.end, 'month');
  const week = axisTicks(range.start, range.end, 'week');
  const day = axisTicks(range.start, range.end, 'day');
  check('month zoom: one tick per day', month.length === 30 && month.every((t) => t.major));
  check('week zoom: 4 ticks per day (6h)', week.length === 120 && week.filter((t) => t.major).length === 30);
  check('day zoom: one tick per hour', day.length === 720);
  const sixPm = day.find((t) => t.label === '6 PM');
  const bar = layoutTimeline([ev('x', '2026-09-01T18:00:00Z', '2026-09-01T20:00:00Z')], range.start, range.end, PX_PER_HOUR.day).bars[0];
  check('the "6 PM" tick and a 6pm bar share the same x', near(sixPm.x, bar.left), `${sixPm.x} vs ${bar.left}`);
  check('day-boundary ticks are labelled with weekday and date', week[0].label === 'Tue 1', week[0].label);
}

// ---- virtualization query --------------------------------------------------------
{
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const events = Array.from({ length: 600 }, (_, i) => {
    const s = Date.UTC(2026, 8, 1) + Math.floor(rand() * 29 * 24) * H;
    return ev(`v${i}`, new Date(s).toISOString(), new Date(s + (1 + rand() * 50) * H).toISOString());
  });
  const { bars, laneCount } = layoutTimeline(events, range.start, range.end, PX_PER_HOUR.day);
  let mismatches = 0;
  for (let i = 0; i < 200; i++) {
    const x0 = rand() * 40000, x1 = x0 + 200 + rand() * 3000;
    const l0 = Math.floor(rand() * laneCount), l1 = l0 + Math.floor(rand() * 10);
    const fast = new Set(visibleBars(bars, x0, x1, l0, l1).map((b) => b.event.id));
    const brute = new Set(bars.filter((b) => b.left <= x1 && b.left + b.width >= x0 && b.lane >= l0 && b.lane <= l1).map((b) => b.event.id));
    if (fast.size !== brute.size || [...fast].some((id) => !brute.has(id))) mismatches++;
  }
  check('visibleBars matches a brute-force filter on 200 random windows', mismatches === 0, String(mismatches));
  const onScreen = visibleBars(bars, 10000, 11280).length;
  check('a 1280px window at day zoom touches only a small fraction of 600 events', onScreen < 100, String(onScreen));
}

// ---- performance sanity ------------------------------------------------------------
{
  const events = Array.from({ length: 2000 }, (_, i) => {
    const s = Date.UTC(2026, 8, 1, 12) + (i % 680) * H; // noon UTC start: stays inside September in New York time
    return ev(`p${i}`, new Date(s).toISOString(), new Date(s + ((i % 9) + 1) * H).toISOString(), 'America/New_York');
  });
  const t0 = performance.now();
  const { bars } = layoutTimeline(events, range.start, range.end, px);
  const ms = performance.now() - t0;
  check('laying out 2,000 events takes under 250ms', ms < 250 && bars.length === 2000, `${ms.toFixed(1)}ms`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
