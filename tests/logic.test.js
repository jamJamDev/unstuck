// Unit tests for Unstuck's decision core. Zero dependencies — node --test only.
// Run with ./test.sh (or `node --test tests/`).

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

// --------------------------------------------------------------- fixtures

let seq = 0;
const item = (text, extra) => Object.assign(L.newItem(text), { id: 'i' + ++seq }, extra || {});

function list(name, kind, texts, extra) {
  const l = L.newList(name, kind, 'amber');
  l.id = 'l-' + name;
  l.items = texts.map((t) => (typeof t === 'string' ? item(t) : t));
  return Object.assign(l, extra || {});
}

function stateWith(lists, selection, history) {
  return { schema: L.SCHEMA, lists, selection: selection || [], history: history || [] };
}

/** Deterministic stand-in for Math.random: replays the given fractions. */
function rng(...values) {
  let i = 0;
  return () => values[i++ % values.length];
}

// ---------------------------------------------------------------- migrate

test('migrate rejects payloads that are not an Unstuck backup', () => {
  for (const bad of [null, undefined, 42, 'text', [], {}, { lists: 'nope' }, { lists: null }]) {
    assert.throws(() => L.migrate(bad), /not in the expected format/, 'accepted ' + JSON.stringify(bad));
  }
});

test('migrate coerces field types rather than trusting the file', () => {
  const out = L.migrate({
    lists: [{
      id: 'keep-me',
      name: 42,
      kind: 'endless',
      color: 'sky',
      items: [{ id: 'x', text: 'Thing', done: 'yes', doneAt: 'nope', count: '3', lastDone: 1700000000000 }],
    }],
  });
  const it = out.lists[0].items[0];
  assert.equal(out.lists[0].id, 'keep-me');
  assert.equal(out.lists[0].name, '42');
  assert.equal(it.done, true, 'truthy strings must become a real boolean');
  assert.equal(it.doneAt, 0, 'an unparseable number must fall back to 0, not NaN');
  assert.equal(it.count, 3, 'numeric strings must become numbers');
  assert.equal(it.lastDone, 1700000000000);
});

test('migrate falls back on unknown kinds and colours', () => {
  const out = L.migrate({ lists: [{ name: 'X', kind: 'wat', color: 'chartreuse', items: [] }] });
  assert.equal(out.lists[0].kind, 'once');
  assert.equal(out.lists[0].color, L.COLORS[0]);
});

test('migrate does not let a prototype-polluting kind through', () => {
  // A bare `KIND_LABEL[kind]` truthiness check would accept "constructor".
  const out = L.migrate({ lists: [{ name: 'X', kind: 'constructor', items: [] }] });
  assert.equal(out.lists[0].kind, 'once');
});

test('a schema 1 to-do list keeps behaving exactly as it did', () => {
  const out = L.migrate({
    schema: 1,
    lists: [{ id: 'a', name: 'Chores', kind: 'todo', color: 'sky', items: [{ id: 'x', text: 'Wash up' }] }],
  });
  assert.deepEqual(
    { kind: out.lists[0].kind, keepDone: out.lists[0].keepDone, showProgress: out.lists[0].showProgress },
    { kind: 'once', keepDone: false, showProgress: false },
    'a to-do swept finished things away and showed what was left'
  );
  assert.equal(out.lists[0].items[0].text, 'Wash up', 'nothing in it may be lost');
});

test('a schema 1 collection keeps its record and its progress bar', () => {
  const out = L.migrate({
    schema: 1,
    lists: [{ id: 'b', name: 'Books', kind: 'checklist', color: 'rose', items: [{ id: 'y', text: 'Piranesi', done: true }] }],
  });
  assert.deepEqual(
    { kind: out.lists[0].kind, keepDone: out.lists[0].keepDone, showProgress: out.lists[0].showProgress },
    { kind: 'once', keepDone: true, showProgress: true },
    'a collection was exactly these two display choices switched on'
  );
  assert.equal(out.lists[0].items[0].done, true, 'ticks must survive the migration');
});

test('a legacy kind cannot be overridden by stray display fields in the file', () => {
  // The old kind fully determined both, so a schema 1 payload's own flags are noise.
  const out = L.migrate({
    lists: [{ name: 'Books', kind: 'checklist', keepDone: false, showProgress: false, items: [] }],
  });
  assert.equal(out.lists[0].keepDone, true);
  assert.equal(out.lists[0].showProgress, true);
});

test('migrating twice changes nothing the second time', () => {
  const once = L.migrate({ schema: 1, lists: [{ name: 'Books', kind: 'checklist', items: [{ text: 'X' }] }] });
  assert.deepEqual(L.migrate(JSON.parse(JSON.stringify(once))), once, 'migration must be idempotent');
});

test('migrate drops items with no usable text and gives every item an id', () => {
  const out = L.migrate({
    lists: [{ name: 'X', items: [{ text: 'Real' }, { text: '   ' }, { text: '' }, { text: null }, 'junk', null] }],
  });
  assert.deepEqual(out.lists[0].items.map((i) => i.text), ['Real']);
  assert.ok(out.lists[0].items[0].id, 'a missing id must be generated');
});

test('migrate drops selection entries whose list is gone', () => {
  const out = L.migrate({
    lists: [{ id: 'a', name: 'A', items: [] }],
    selection: ['a', 'deleted-list', 7],
  });
  assert.deepEqual(out.selection, ['a']);
});

test('migrate caps history and keeps only the newest entries', () => {
  const history = Array.from({ length: 60 }, (_, i) => 'h' + i);
  const out = L.migrate({ lists: [], history });
  assert.equal(out.history.length, L.HISTORY_LIMIT);
  assert.equal(out.history[out.history.length - 1], 'h59', 'the newest entry must survive');
});

test('migrate survives a missing items array', () => {
  const out = L.migrate({ lists: [{ name: 'X' }] });
  assert.deepEqual(out.lists[0].items, []);
});

// ------------------------------------------------------------------- pool

test('an endless list keeps its items in the pool even when flagged done', () => {
  const endless = list('Ongoing', 'endless', [item('Guitar', { done: true, count: 4 })]);
  assert.equal(L.isPickable(endless, endless.items[0]), true);
  assert.equal(L.pickableCount(endless), 1);
});

test('a tick-off list drops done items from the pool however it displays them', () => {
  // The display choices must be invisible to the picker — that is the whole
  // reason they stopped being separate kinds.
  for (const display of [{}, { keepDone: true }, { showProgress: true }, { keepDone: true, showProgress: true }]) {
    const l = list('L', 'once', [item('open'), item('closed', { done: true })], display);
    assert.equal(L.pickableCount(l), 1, 'counted a done item with ' + JSON.stringify(display));
    assert.equal(L.isPickable(l, l.items[1]), false);
  }
});

test('an empty selection means every list is in play', () => {
  const s = stateWith([list('A', 'once', ['a1']), list('B', 'once', ['b1'])]);
  assert.equal(L.activeLists(s).length, 2);
  assert.equal(L.pool(s).length, 2);
});

test('a selection scopes the pool to the chosen lists only', () => {
  const a = list('A', 'once', ['a1', 'a2']);
  const b = list('B', 'once', ['b1']);
  const s = stateWith([a, b], [b.id]);
  assert.deepEqual(L.pool(s).map((c) => c.item.text), ['b1']);
});

test('pool entries carry the list they came from', () => {
  const s = stateWith([list('Books', 'once', ['Piranesi'])]);
  assert.equal(L.pool(s)[0].list.name, 'Books');
});

test('listById returns null for an unknown id rather than undefined', () => {
  assert.equal(L.listById(stateWith([]), 'nope'), null);
});

// ------------------------------------------------------------------- pick

test('recentDepth scales with pool size and never exceeds its cap', () => {
  assert.equal(L.recentDepth(0), 0);
  assert.equal(L.recentDepth(1), 0);
  assert.equal(L.recentDepth(2), 1);
  assert.equal(L.recentDepth(7), 3);
  assert.equal(L.recentDepth(500), 5);
});

test('chooseFrom returns null for an empty pool', () => {
  assert.equal(L.chooseFrom([], new Set(), []), null);
});

test('a one-item pool still picks that item even though it fills history', () => {
  // Regression: recentDepth is 0 here and history.slice(-0) returns the WHOLE
  // history, which would filter the only candidate out.
  const l = list('Solo', 'once', ['The only thing']);
  const all = L.pool(stateWith([l]));
  const history = Array(10).fill(l.items[0].id);
  const drawn = L.chooseFrom(all, new Set(), history, rng(0));
  assert.ok(drawn, 'must not refuse to pick');
  assert.equal(drawn.choice.item.text, 'The only thing');
});

test('chooseFrom skips items already offered in this reroll run', () => {
  const l = list('A', 'once', ['one', 'two', 'three']);
  const all = L.pool(stateWith([l]));
  const shown = new Set([all[0].item.id, all[1].item.id]);
  const drawn = L.chooseFrom(all, shown, [], rng(0));
  assert.equal(drawn.choice.item.text, 'three');
  assert.equal(drawn.exhausted, false);
});

test('chooseFrom reports exhaustion and still picks once everything was shown', () => {
  const l = list('A', 'once', ['one', 'two']);
  const all = L.pool(stateWith([l]));
  const shown = new Set(all.map((c) => c.item.id));
  const drawn = L.chooseFrom(all, shown, [], rng(0));
  assert.equal(drawn.exhausted, true, 'the caller needs this to reset the run');
  assert.ok(drawn.choice, 'must never stall when every item has been seen');
});

test('chooseFrom avoids the recent history when fresh candidates exist', () => {
  const l = list('A', 'once', ['one', 'two', 'three', 'four']);
  const all = L.pool(stateWith([l]));
  // depth for a pool of 4 is 2, so the last two ids are off-limits.
  const history = [all[0].item.id, all[1].item.id];
  for (const r of [0, 0.4, 0.9]) {
    const drawn = L.chooseFrom(all, new Set(), history, rng(r));
    assert.ok(['three', 'four'].includes(drawn.choice.item.text), 'picked a recent item: ' + drawn.choice.item.text);
  }
});

test('chooseFrom ignores history when avoiding it would leave nothing', () => {
  const l = list('A', 'once', ['one', 'two']);
  const all = L.pool(stateWith([l]));
  const history = all.map((c) => c.item.id);
  const drawn = L.chooseFrom(all, new Set(), history, rng(0.99));
  assert.ok(drawn.choice, 'a fully-recent pool must still yield a pick');
});

test('chooseFrom still picks when every remaining candidate is also recent', () => {
  // Rerolled past one and two, and three and four were the two most recent
  // picks — every survivor is disqualified, so the recency rule must yield.
  const l = list('A', 'once', ['one', 'two', 'three', 'four']);
  const all = L.pool(stateWith([l]));
  const shown = new Set([all[0].item.id, all[1].item.id]);
  const history = [all[2].item.id, all[3].item.id];
  for (const r of [0, 0.99]) {
    const drawn = L.chooseFrom(all, shown, history, rng(r));
    assert.ok(drawn.choice, 'must not return an empty pick');
    assert.ok(['three', 'four'].includes(drawn.choice.item.text), 'got ' + drawn.choice.item.text);
  }
});

test('chooseFrom uses the injected randomness across the whole candidate set', () => {
  const l = list('A', 'once', ['one', 'two', 'three', 'four']);
  const all = L.pool(stateWith([l]));
  assert.equal(L.chooseFrom(all, new Set(), [], rng(0)).choice.item.text, 'one');
  assert.equal(L.chooseFrom(all, new Set(), [], rng(0.99)).choice.item.text, 'four');
  assert.equal(L.chooseFrom(all, new Set(), [], rng(0.5)).choice.item.text, 'three');
});

test('chooseFrom draws across every selected list, not just the first', () => {
  const s = stateWith([list('A', 'once', ['a1']), list('B', 'endless', ['b1'])]);
  const all = L.pool(s);
  const names = new Set();
  for (const r of [0, 0.99]) names.add(L.chooseFrom(all, new Set(), [], rng(r)).choice.list.name);
  assert.deepEqual([...names].sort(), ['A', 'B']);
});

test('pushHistory appends and trims to the newest entries', () => {
  assert.deepEqual(L.pushHistory(['a'], 'b'), ['a', 'b']);
  const full = Array.from({ length: L.HISTORY_LIMIT }, (_, i) => 'h' + i);
  const next = L.pushHistory(full, 'newest');
  assert.equal(next.length, L.HISTORY_LIMIT);
  assert.equal(next[next.length - 1], 'newest');
  assert.equal(next[0], 'h1', 'the oldest entry must fall off the front');
});

test('pushHistory does not mutate the array it was given', () => {
  const before = ['a'];
  L.pushHistory(before, 'b');
  assert.deepEqual(before, ['a']);
});

// ---------------------------------------------------------------- strings

test('plural switches on exactly one', () => {
  assert.equal(L.plural(0, 'thing', 'things'), '0 things');
  assert.equal(L.plural(1, 'thing', 'things'), '1 thing');
  assert.equal(L.plural(2, 'thing', 'things'), '2 things');
});

test('relativeDay names the near past and falls back to a date', () => {
  const now = new Date(2026, 7, 4, 13, 0, 0).getTime();
  const daysAgo = (n, hour) => new Date(2026, 7, 4 - n, hour === undefined ? 9 : hour).getTime();
  assert.equal(L.relativeDay(0, now), '', 'no timestamp means no text');
  assert.equal(L.relativeDay(daysAgo(0, 1), now), 'today', 'earlier the same day is still today');
  assert.equal(L.relativeDay(daysAgo(1), now), 'yesterday');
  assert.equal(L.relativeDay(daysAgo(3), now), '3 days ago');
  assert.equal(L.relativeDay(daysAgo(6), now), '6 days ago');
  assert.equal(L.relativeDay(daysAgo(8), now), 'last week');
  assert.ok(/\d/.test(L.relativeDay(daysAgo(60), now)), 'older than a fortnight shows a date');
});

test('relativeDay treats a future timestamp as today rather than a negative count', () => {
  const now = new Date(2026, 7, 4, 13, 0, 0).getTime();
  assert.equal(L.relativeDay(new Date(2026, 7, 9).getTime(), now), 'today');
});

test('listSummary reads as what is left, or as progress, on request', () => {
  assert.equal(L.listSummary(list('E', 'once', [])), 'Empty');
  assert.equal(L.listSummary(list('T', 'once', [item('a'), item('b', { done: true })])), '1 thing left');
  assert.equal(L.listSummary(list('T', 'once', [item('a', { done: true })])), 'All done');
  assert.equal(
    L.listSummary(list('C', 'once', [item('a', { done: true }), item('b')], { showProgress: true })),
    '1 of 2 done'
  );
  assert.equal(
    L.listSummary(list('O', 'endless', [item('a', { count: 2 }), item('b', { count: 1 })])),
    '2 things · 3 sessions logged'
  );
});

test('the summary style is independent of where finished items go', () => {
  const items = () => [item('a', { done: true }), item('b')];
  // Sweeping finished things away while still reading as progress, and vice versa.
  assert.equal(L.listSummary(list('X', 'once', items(), { keepDone: false, showProgress: true })), '1 of 2 done');
  assert.equal(L.listSummary(list('Y', 'once', items(), { keepDone: true, showProgress: false })), '1 thing left');
});

test('cardMeta explains where the picked item sits in its list', () => {
  const now = new Date(2026, 7, 4).getTime();
  const todo = list('T', 'once', [item('a'), item('b'), item('c', { done: true })]);
  assert.equal(L.cardMeta(todo, todo.items[0], now), '2 things left in this list.');

  const books = list('C', 'once', [item('a', { done: true }), item('b')], { showProgress: true });
  assert.equal(L.cardMeta(books, books.items[1], now), '1 of 2 ticked off so far.');

  const fresh = list('O', 'endless', [item('guitar')]);
  assert.equal(L.cardMeta(fresh, fresh.items[0], now), 'You have not logged this one yet.');

  const logged = list('O', 'endless', [item('guitar', { count: 1, lastDone: new Date(2026, 7, 3).getTime() })]);
  assert.equal(L.cardMeta(logged, logged.items[0], now), 'Done 1 time · last yesterday');
});

// --------------------------------------------------------- starter lists

test('every starter list is valid enough to save and pick from', () => {
  assert.ok(L.STARTER_LISTS.length >= 4, 'the picker needs a real choice');
  const names = new Set();
  for (const spec of L.STARTER_LISTS) {
    assert.ok(spec.name && spec.name.trim(), 'a starter list has no name');
    assert.equal(names.has(spec.name), false, 'duplicate starter name: ' + spec.name);
    names.add(spec.name);
    assert.ok(Object.prototype.hasOwnProperty.call(L.KIND_LABEL, spec.kind), spec.name + ' has kind ' + spec.kind);
    assert.ok(L.COLORS.includes(spec.color), spec.name + ' has colour ' + spec.color);
    assert.ok(Array.isArray(spec.items), spec.name + ' has no items array');
    for (const text of spec.items) assert.ok(text.trim(), spec.name + ' has a blank suggestion');
  }
});

test('the starter set covers both kinds and both display styles', () => {
  const kinds = new Set(L.STARTER_LISTS.map((s) => s.kind));
  assert.deepEqual([...kinds].sort(), ['endless', 'once']);
  assert.ok(L.STARTER_LISTS.some((s) => s.keepDone), 'one should keep a record');
  assert.ok(L.STARTER_LISTS.some((s) => s.kind === 'once' && !s.keepDone), 'one should sweep finished things away');
  assert.ok(L.STARTER_LISTS.some((s) => s.showProgress), 'one should read as progress');
});

test('listFromStarter builds a real, independent list', () => {
  const spec = L.STARTER_LISTS.find((s) => s.items.length);
  const a = L.listFromStarter(spec);
  const b = L.listFromStarter(spec);
  assert.equal(a.name, spec.name);
  assert.equal(a.kind, spec.kind);
  assert.deepEqual(a.items.map((i) => i.text), spec.items);
  assert.notEqual(a.id, b.id, 'two copies must not share an id');
  assert.notEqual(a.items[0].id, b.items[0].id, 'two copies must not share item ids');
  a.items[0].done = true;
  assert.equal(spec.items.includes(a.items[0]), false, 'the template must not be mutable through its copies');
});

test('a starter list survives the save/load round-trip unchanged', () => {
  const lists = L.STARTER_LISTS.map(L.listFromStarter);
  const s = { schema: L.SCHEMA, lists, selection: [], history: [] };
  assert.deepEqual(L.migrate(JSON.parse(JSON.stringify(s))), s);
});

// ------------------------------------------------- done and count in step

test('ticking something off counts as one completion', () => {
  const it = item('read it');
  L.setDone(it, true, 1000);
  assert.equal(it.done, true);
  assert.equal(it.count, 1, 'an ongoing view must not read zero for a ticked item');
  assert.equal(it.lastDone, 1000);
});

test('a ticked item shows one session once the list becomes ongoing', () => {
  const l = list('Books', 'once', [item('Piranesi')]);
  L.setDone(l.items[0], true, 1000);
  l.kind = 'endless';
  assert.equal(L.cardMeta(l, l.items[0], 1000), 'Done 1 time · last today');
  assert.equal(L.listSummary(l), '1 thing · 1 session logged');
});

test('unticking withdraws the completion the tick implied', () => {
  const it = item('read it');
  L.setDone(it, true, 1000);
  L.setDone(it, false, 2000);
  assert.equal(it.done, false);
  assert.equal(it.count, 0, 'the implied session must go with the tick');
  assert.equal(it.lastDone, 0);
});

test('unticking never destroys a tally built from real sessions', () => {
  const it = item('guitar');
  for (let i = 0; i < 10; i++) L.logSession(it, 1000 + i);
  L.setDone(it, false, 3000);
  assert.equal(it.done, false);
  assert.equal(it.count, 10, 'ten logged sessions must survive an untick');
});

test('logging a session also marks it finished for the tick views', () => {
  const it = item('guitar');
  L.logSession(it, 1000);
  assert.equal(it.count, 1);
  assert.equal(it.done, true, 'switching to a tick view must show it ticked');
  assert.equal(it.doneAt, 1000);
});

test('the full journey: tick, switch to ongoing, log up to ten, switch back', () => {
  const l = list('Practice', 'once', [item('guitar')]);
  const it = l.items[0];

  L.setDone(it, true, 1000);
  assert.equal(L.pickableCount(l), 0, 'ticked, so out of the pool');

  l.kind = 'endless';
  assert.equal(it.count, 1, 'the tick reads as one session');
  assert.equal(L.pickableCount(l), 1, 'ongoing items are always pickable');

  for (let i = 2; i <= 10; i++) L.logSession(it, 1000 + i);
  assert.equal(it.count, 10);

  l.kind = 'once';
  assert.equal(it.done, true, 'ten sessions means it has certainly been done');
  assert.equal(L.pickableCount(l), 0);

  l.kind = 'endless';
  assert.equal(it.count, 10, 'the tally must come back intact');
  assert.equal(L.cardMeta(l, it, 1010).startsWith('Done 10 times'), true);
});

test('a never-touched item stays at zero under every kind', () => {
  const l = list('Fresh', 'once', [item('untouched')]);
  for (const kind of ['once', 'endless']) {
    l.kind = kind;
    assert.equal(L.pickableCount(l), 1, 'must stay pickable as ' + kind);
  }
  assert.equal(l.items[0].count, 0);
  assert.equal(l.items[0].done, false);
});

// ----------------------------------------------------------- kind changes

test('switching a list to ongoing returns its ticked items to the pool', () => {
  const l = list('Books', 'once', [item('read it', { done: true, doneAt: 123 }), item('unread')]);
  assert.equal(L.pickableCount(l), 1);
  l.kind = 'endless';
  assert.equal(L.pickableCount(l), 2, 'an ongoing list has no unpickable items');
});

test('switching back from ongoing restores the ticks exactly', () => {
  const l = list('Books', 'once', [item('read it', { done: true, doneAt: 123 }), item('unread')]);
  l.kind = 'endless';
  l.kind = 'once';
  assert.equal(L.pickableCount(l), 1, 'the tick must survive the round trip');
  assert.equal(l.items[0].doneAt, 123, 'when it was done must survive too');
});

test('session counts survive a switch away from ongoing and back', () => {
  const l = list('Keep', 'endless', [item('guitar', { count: 7, lastDone: 999 })]);
  l.kind = 'once';
  assert.equal(l.items[0].count, 7);
  l.kind = 'endless';
  assert.equal(L.cardMeta(l, l.items[0], 999).startsWith('Done 7 times'), true);
});

test('a list reads correctly under each kind without touching its items', () => {
  const l = list('Mixed', 'once', [item('a', { done: true, count: 2 }), item('b')]);
  const snapshot = JSON.stringify(l.items);
  const summaries = {};

  summaries.left = L.listSummary(l);
  l.showProgress = true;
  summaries.progress = L.listSummary(l);
  l.kind = 'endless';
  summaries.ongoing = L.listSummary(l);

  assert.equal(JSON.stringify(l.items), snapshot, 'reading a list must never mutate it');
  assert.deepEqual(summaries, {
    left: '1 thing left',
    progress: '1 of 2 done',
    ongoing: '2 things · 2 sessions logged',
  });
});

// ------------------------------------------------------------------ shape

test('emptyState is a valid state that round-trips through migrate', () => {
  const s = L.emptyState();
  assert.deepEqual(L.migrate(JSON.parse(JSON.stringify(s))), s);
});

test('a full state survives a JSON backup round-trip unchanged', () => {
  const s = stateWith(
    [list('A', 'once', ['a1']), list('B', 'endless', [item('b1', { count: 2, lastDone: 1700000000000 })])],
    ['l-A'],
    ['i1']
  );
  assert.deepEqual(L.migrate(JSON.parse(JSON.stringify(s))), s);
});

test('newItem and newList start in a clean, pickable state', () => {
  const it = L.newItem('Something');
  assert.deepEqual(
    { done: it.done, doneAt: it.doneAt, count: it.count, lastDone: it.lastDone },
    { done: false, doneAt: 0, count: 0, lastDone: 0 }
  );
  assert.ok(it.id);
  const l = L.newList('Name', 'once', 'sky');
  assert.deepEqual(l.items, []);
  assert.notEqual(L.newList('a', 'once', 'sky').id, L.newList('a', 'once', 'sky').id, 'ids must be unique');
});
