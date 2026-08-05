// Unstuck's decision core: state shape, validation, the pick algorithm, and the
// strings derived from a list. Pure — no DOM, no storage, no clock of its own —
// so index.html can stay a thin shell and tests/ can drive this directly.
// Loads as a classic script in the browser (window.UnstuckLogic) and via
// require() in Node.

var UnstuckLogic = (() => {
  'use strict';

  const SCHEMA = 1;
  const STORE_KEY = 'unstuck.v1';
  const COLORS = ['amber', 'rose', 'violet', 'sky', 'emerald', 'teal', 'orange', 'indigo'];

  /**
   * A list's kind decides what "done" means and whether an item stays in the pool:
   *   todo      — done items leave the pool and can be cleared away
   *   checklist — done items leave the pool but stay as a record
   *   endless   — never done; each pick logs a session and it stays in the pool
   */
  const KIND_LABEL = { todo: 'To-do', checklist: 'Collection', endless: 'Ongoing' };

  const HISTORY_LIMIT = 40;
  const MAX_RECENT_AVOIDED = 5;

  function uid() {
    const c = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function emptyState() {
    return { schema: SCHEMA, lists: [], selection: [], history: [] };
  }

  function newItem(text) {
    return { id: uid(), text, done: false, doneAt: 0, count: 0, lastDone: 0 };
  }

  function newList(name, kind, color) {
    return { id: uid(), name, kind, color, items: [] };
  }

  /**
   * Ready-made lists, offered on a first run and from the Lists screen. Themed by
   * what they are about, with the kind that suits how that theme gets finished.
   * The ones whose contents are a matter of personal taste start empty on
   * purpose — a suggested reading list would just be someone else's.
   */
  const STARTER_LISTS = [
    {
      name: 'Around the house', kind: 'todo', color: 'sky',
      items: ['Wash up', 'Change the sheets', 'Take the bins out', 'Sort the pile on the chair',
        'Water the plants', 'Wipe down the kitchen'],
    },
    {
      name: 'Productive', kind: 'todo', color: 'amber',
      items: ['Clear the inbox', 'Pay that bill you keep forgetting', 'Book the appointment',
        'Back up your files', 'Reply to the message you have been avoiding', 'Tidy your desk'],
    },
    {
      name: 'Creative', kind: 'endless', color: 'violet',
      items: ['Sketch for fifteen minutes', 'Write two hundred words', 'Practise an instrument',
        'Photograph something ordinary', 'Make a playlist', 'Pick up something you abandoned'],
    },
    {
      name: 'Get outside', kind: 'endless', color: 'emerald',
      items: ['Walk a route you have never taken', 'Ten minutes in the sun', 'Stretch properly',
        'Go and look at some water'],
    },
    {
      name: 'Rest', kind: 'endless', color: 'teal',
      items: ['Lie down and do nothing', 'Make a proper cup of tea', 'Put on an album and just listen',
        'Have a bath', 'Go to bed early'],
    },
    {
      name: 'Learn something', kind: 'endless', color: 'indigo',
      items: ['One language lesson', 'Read a long article you saved', 'Watch a documentary',
        'Ten minutes of a tutorial'],
    },
    { name: 'Books to read', kind: 'checklist', color: 'rose', items: [] },
    { name: 'Films to watch', kind: 'checklist', color: 'orange', items: [] },
  ];

  function listFromStarter(spec) {
    const l = newList(spec.name, spec.kind, spec.color);
    l.items = spec.items.map((text) => newItem(text));
    return l;
  }

  /**
   * The single gate every inbound payload passes: page load and backup import
   * both. Coerces field types, drops unusable items, and throws on anything not
   * shaped like an Unstuck backup so a bad file cannot corrupt live state.
   */
  function migrate(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.lists)) {
      throw new Error('Unstuck: backup is not in the expected format');
    }
    const lists = data.lists
      .filter((l) => l && typeof l === 'object')
      .map((l) => ({
        id: typeof l.id === 'string' && l.id ? l.id : uid(),
        name: String(l.name || 'Untitled list'),
        kind: Object.prototype.hasOwnProperty.call(KIND_LABEL, l.kind) ? l.kind : 'todo',
        color: COLORS.includes(l.color) ? l.color : COLORS[0],
        items: Array.isArray(l.items)
          ? l.items
              .filter((it) => it && typeof it === 'object')
              .map((it) => ({
                id: typeof it.id === 'string' && it.id ? it.id : uid(),
                text: String(it.text == null ? '' : it.text),
                done: Boolean(it.done),
                doneAt: Number(it.doneAt) || 0,
                count: Number(it.count) || 0,
                lastDone: Number(it.lastDone) || 0,
              }))
              .filter((it) => it.text.trim() !== '')
          : [],
      }));

    const ids = new Set(lists.map((l) => l.id));
    return {
      schema: SCHEMA,
      lists,
      selection: Array.isArray(data.selection) ? data.selection.filter((id) => ids.has(id)) : [],
      history: Array.isArray(data.history)
        ? data.history.filter((h) => typeof h === 'string').slice(-HISTORY_LIMIT)
        : [],
    };
  }

  // -------------------------------------------------------- completing things

  /**
   * `done` and `count` are two readings of one fact — how many times this has
   * been finished — so they are kept in step. Otherwise a list switched from
   * Collection to Ongoing shows a ticked item at zero sessions, and switching
   * back loses the tally.
   */
  function setDone(item, done, now) {
    const at = now === undefined ? Date.now() : now;
    item.done = done;
    item.doneAt = done ? at : 0;
    if (done) {
      // Ticking something off is itself one completion.
      if (item.count === 0) {
        item.count = 1;
        item.lastDone = at;
      }
    } else if (item.count === 1) {
      // Unticking withdraws the completion the tick implied — but never a real
      // tally built up from logged sessions.
      item.count = 0;
      item.lastDone = 0;
    }
  }

  function logSession(item, now) {
    const at = now === undefined ? Date.now() : now;
    item.count += 1;
    item.lastDone = at;
    // A logged session is a completion too, so the tick views agree with it.
    item.done = true;
    item.doneAt = at;
  }

  // ------------------------------------------------------------------- pool

  function listById(state, id) {
    return state.lists.find((l) => l.id === id) || null;
  }

  function isPickable(list, item) {
    return list.kind === 'endless' ? true : !item.done;
  }

  function pickableCount(list) {
    return list.items.filter((it) => isPickable(list, it)).length;
  }

  /** No selection means every list is in play. */
  function activeLists(state) {
    if (!state.selection.length) return state.lists;
    return state.lists.filter((l) => state.selection.includes(l.id));
  }

  function pool(state) {
    const out = [];
    for (const list of activeLists(state)) {
      for (const item of list.items) {
        if (isPickable(list, item)) out.push({ list, item });
      }
    }
    return out;
  }

  // ------------------------------------------------------------------- pick

  /** How many recent picks to avoid repeating, scaled to pool size. */
  function recentDepth(poolSize) {
    return Math.min(MAX_RECENT_AVOIDED, Math.max(0, Math.floor(poolSize / 2)));
  }

  /**
   * Draws one entry from `all`, preferring things not yet offered in this run of
   * rerolls and, failing that, things not in recent history. Returns null for an
   * empty pool, otherwise `{ choice, exhausted }` — `exhausted` tells the caller
   * every candidate had already been shown, so the run should start over.
   */
  function chooseFrom(all, shown, history, random) {
    if (!all.length) return null;
    const rng = random || Math.random;

    let candidates = all.filter((c) => !shown.has(c.item.id));
    const exhausted = candidates.length === 0;
    if (exhausted) candidates = all;

    // slice(-0) would return the whole history, so a zero depth is taken as none.
    const depth = recentDepth(all.length);
    const recent = depth > 0 ? history.slice(-depth) : [];
    const fresh = candidates.filter((c) => !recent.includes(c.item.id));
    if (fresh.length) candidates = fresh;

    return { choice: candidates[Math.floor(rng() * candidates.length)], exhausted };
  }

  function pushHistory(history, id) {
    const next = history.concat(id);
    return next.length > HISTORY_LIMIT ? next.slice(-HISTORY_LIMIT) : next;
  }

  // ---------------------------------------------------------------- strings

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  function relativeDay(ts, now) {
    if (!ts) return '';
    const then = new Date(ts);
    const today = now === undefined ? new Date() : new Date(now);
    const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOf(today) - startOf(then)) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return days + ' days ago';
    if (days < 14) return 'last week';
    if (days < 365) return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return then.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }

  function listSummary(list) {
    if (!list.items.length) return 'Empty';
    if (list.kind === 'endless') {
      const sessions = list.items.reduce((n, it) => n + it.count, 0);
      return plural(list.items.length, 'thing', 'things') + ' · ' + plural(sessions, 'session', 'sessions') + ' logged';
    }
    const done = list.items.filter((it) => it.done).length;
    if (list.kind === 'checklist') return done + ' of ' + list.items.length + ' done';
    const left = list.items.length - done;
    return left === 0 ? 'All done' : plural(left, 'thing', 'things') + ' left';
  }

  /** The line under a picked item, explaining where it sits in its list. */
  function cardMeta(list, item, now) {
    if (list.kind === 'endless') {
      if (!item.count) return 'You have not logged this one yet.';
      return 'Done ' + plural(item.count, 'time', 'times') + ' · last ' + relativeDay(item.lastDone, now);
    }
    if (list.kind === 'checklist') {
      const done = list.items.filter((it) => it.done).length;
      return done + ' of ' + list.items.length + ' ticked off so far.';
    }
    const left = list.items.filter((it) => !it.done).length;
    return plural(left, 'thing', 'things') + ' left in this list.';
  }

  return {
    SCHEMA, STORE_KEY, COLORS, KIND_LABEL, HISTORY_LIMIT, STARTER_LISTS,
    uid, emptyState, newItem, newList, listFromStarter, migrate,
    setDone, logSession,
    listById, isPickable, pickableCount, activeLists, pool,
    recentDepth, chooseFrom, pushHistory,
    plural, relativeDay, listSummary, cardMeta,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UnstuckLogic;
