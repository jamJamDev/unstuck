# Unstuck

Can't decide what to do? Keep your lists here and tap one big button — Unstuck picks something
at random so you don't have to choose. Skip it and it picks again.

Personal project. Web-first, built so it can be wrapped for Google Play and the App Store later.
Everything is stored on the device; nothing is ever uploaded.

## Run it

**Just looking at it:** double-click `index.html`. It opens in the browser off the filesystem and
works fully — lists, picking, swiping, and saving all fine. The only thing missing over `file://` is
the service worker, so there is no offline install; the app checks the protocol and skips
registering rather than erroring.

**Testing on a phone, or installing it:**

```sh
./run_unstuck.sh             # serves on :8010, prints a LAN URL for your phone
```

Open `http://localhost:8010/` on the desktop, or the printed `http://<lan-ip>:8010/` on a phone on
the same Wi-Fi. Installing as a PWA needs HTTPS or localhost, so a phone over plain HTTP runs it in
the browser only — for a real "Add to Home Screen" install, host the folder on GitHub Pages or
Netlify.

**Editing gotcha:** `sw.js` is network-first, but browsers still cache aggressively. After an edit,
hard-refresh, or bump `CACHE` in `sw.js` (currently `unstuck-v3`), or load with a `?v=N`
cache-buster. If a change seems not to apply, this is almost always why.

## Layout

No build step, no dependencies — plain files served as-is.

```
index.html               the UI: markup, CSS, and the DOM shell in one IIFE
logic.js                 the decision core: state shape, validation, the pick algorithm
sw.js                    service worker, caches the app shell — bump CACHE on release
manifest.webmanifest     PWA manifest
icons/                   generated app icons
scripts/make_icons.js    regenerates icons/ (zero-dependency PNG writer)
tests/logic.test.js      unit tests for logic.js (node --test)
tests/dom.test.html      in-browser tests that drive the real app in an iframe
run.sh / run_unstuck.sh  local server
verify.sh                syntax, JSON, and service-worker-shell checks
test.sh                  runs the suites
build_install.sh         loud N/A — there is nothing to build
```

`logic.js` holds everything decidable without a DOM, so it can be tested directly and `index.html`
stays a thin shell over it. It loads as a classic script (`window.UnstuckLogic`) rather than a
module, so the app still opens straight off the filesystem. If it fails to load, the app says so in
a banner instead of dying silently.

## Tests

```sh
./test.sh                # unit tests — fast, no browser
./test.sh --browser      # also serves and opens the in-browser suite
./verify.sh              # syntax + JSON + service-worker shell check
```

Two suites, split by what each can actually reach:

- **`tests/logic.test.js`** (54 checks, `node --test`, zero dependencies) — validation and coercion
  in `migrate` including the schema 1 upgrade, pool membership per kind, selection scoping, the
  starter-list definitions, the done/count linkage, and the pick algorithm with an injected RNG so
  every branch is deterministic.
- **`tests/dom.test.html`** (27 checks) — loads the real app in an iframe with real CSS and real
  `localStorage`. This is where wiring bugs live: that `hidden` elements are actually not displayed,
  that focus survives a chip toggle, that a rename reaches every label, that the starter picker adds
  only what was ticked, that a kind change keeps every item, that the two display switches are
  genuinely independent, that corrupt saved data warns instead of starting silently empty.

Both suites were mutation-checked — the behaviour each one guards was deliberately broken to confirm
the right test turns red. The one thing neither covers is the **drag gesture**: synthetic pointer
events cannot hold a pointer capture, so swipe-to-skip and swipe-to-accept are verified by hand.

## Lists: two independent axes

A list has a **theme** (what it is about) and a **kind** (how finishing works). They are deliberately
separate, because theme cannot determine mechanics — "Creative" spans both kinds: *sketch for
fifteen minutes* is ongoing, while *finish the album art* is something you tick off once.

The theme is just the list's name. The kind decides exactly one thing — whether finishing takes an
item out of the pool — so there are only two:

| Kind | For | Finishing something |
|---|---|---|
| **Tick off** | chores, books, errands | takes it out of the hat |
| **Ongoing** | practise guitar, go for a walk | never leaves — each pick logs a session (`3× · last Tuesday`) |

Everything else is presentation, and each part is its own switch on a tick-off list:

- **Once something's ticked off** — it stays put as a record, or drops into a **Done** pile you can
  clear out.
- **How the list reads** — `2 of 12 done` with a progress bar, or `10 things left`.

These are independent: a chores list can show a progress bar, a reading list can count down what is
left. Schema 1 had a third kind, `checklist`, which was only ever these two switches turned on
together — which is exactly why it felt like a duplicate of `todo` in use. The picker cannot tell
any of it apart; only `kind` ever reaches it.

**The kind is not a commitment.** Change it whenever, from Rename & colour — you rarely know which
mechanic fits until you have lived with a list.

Switching is lossless because `done` and `count` are two readings of one fact — *how many times has
this been finished* — and are kept in step:

- Ticking something off is itself one completion, so it reads as `1×` if the list becomes Ongoing.
- Logging a session marks it finished, so it reads as ticked if the list becomes a tick list.
- Unticking withdraws the completion a tick implied, but never a tally built from real sessions —
  untick something with ten logged sessions and all ten survive.

An Ongoing list never strikes anything out or shows a Done section, whatever `done` says underneath.

**Starter lists** (offered on a first run, and any time from the Lists screen) are themed, with the
kind that suits them already set: Around the house, Productive, Creative, Get outside, Rest, Learn
something, Books to read, Films to watch. Nothing is preselected — you tick the ones you want, and
they are ordinary lists afterwards, editable and deletable like any other. The ones whose contents
are a matter of taste (books, films) arrive empty on purpose; a suggested reading list would just be
someone else's.

## How picking works

`pool()` is every pickable item across the **selected** lists — the chips at the top of the Decide
screen. No chips selected means everything.

Two layers keep rerolls from feeling repetitive:

- **`session.shown`** — items already offered in the current run of rerolls are skipped. When the run
  is exhausted it clears and starts over, so the picker never refuses to pick.
- **`state.history`** — the last 40 accepted-or-offered item ids, persisted. `recentDepth()` scales
  how many of those to avoid with pool size (`min(5, floor(pool/2))`), so a two-item list still
  works instead of deadlocking.

Selection is otherwise uniform random — no weighting, no priority. That is deliberate: knobs to
tune are one more thing to stall on.

Accepting a pick ticks it off on a tick-off list, and logs one more session on an ongoing one.
Every destructive or state-changing action shows a toast with **Undo**.

## Interaction

The card can be driven three ways, and all three do the same two things:

| | Skip (reroll) | Accept |
|---|---|---|
| Touch | swipe left | swipe right |
| Pointer | drag left, or the **Skip** button | drag right, or **I'm doing it** |
| Keyboard | `←` while the card has focus | `→` |

A vertical drag is released back to the page so the swipe handler never eats a scroll. The hint line
under the card changes wording based on `(pointer: coarse)`. `prefers-reduced-motion` drops the
shuffle animation and the fly-out; the result still lands and is announced through the live region.

## Storage

One `localStorage` key, `unstuck.v1`:

```jsonc
{
  "schema": 2,
  "lists": [{ "id", "name", "kind", "color", "keepDone", "showProgress", "items": [
    { "id", "text", "done", "doneAt", "count", "lastDone" }
  ]}],
  "selection": ["<list id>"],   // empty = every list
  "history": ["<item id>"]      // last 40, newest last
}
```

`migrate()` (in `logic.js`) is the single gate every inbound payload passes through — page load and
backup import both. It coerces field types, drops empty items, resolves schema 1's three kinds into
the current two-plus-two-switches shape, and throws on anything that isn't shaped like an Unstuck
backup, so a bad import can't corrupt live state. It is idempotent, and an upgraded payload is
written straight back so an old format never lingers in storage.

If saved data can't be parsed, the app says so in a banner and **leaves the bytes alone** — the
export button writes the raw stored string rather than the in-memory state, so a backup can still
rescue data this build failed to read.

Backups are plain JSON via **Backup & data** (the gear icon), which is also how you move lists
between devices — storage is per-device and per-browser.

## Shipping to the stores

The app is already store-shaped: relative paths only, no network calls, portrait manifest, safe-area
insets, maskable icon. Wrapping it is the next step, not a rewrite.

- **Google Play** — either [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) (a TWA
  pointing at the hosted PWA; needs a real HTTPS host and Digital Asset Links) or Capacitor, which
  bundles these files into the APK and needs no host at all. Capacitor is the better fit here since
  the app is fully offline.
- **App Store** — Capacitor with the iOS target. Needs a Mac with Xcode and a paid Apple developer
  account. Apple rejects apps that are "just a website", so the offline-first install and native
  packaging matter.

Neither wrapper is set up in this repo yet.

## Regenerating icons

```sh
node scripts/make_icons.js
```

Writes `icons/icon-192.png`, `icon-512.png`, and `icon-512-maskable.png` — a tilted amber die on a
dark field. Pure Node, no dependencies: it rasterises with signed-distance functions and writes the
PNG chunks by hand. The maskable variant shrinks the die into the safe zone so platform masks don't
clip it.
