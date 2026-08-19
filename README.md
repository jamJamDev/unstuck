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
hard-refresh, or bump `CACHE` in `sw.js` (currently `unstuck-v6`), or load with a `?v=N`
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

- **`tests/logic.test.js`** (100 checks, `node --test`, zero dependencies) — validation and coercion
  in `migrate` including the schema 1 upgrade and colour validation, pool membership per kind,
  selection scoping, the starter-list definitions, the done/count linkage, the subtask rule in both
  directions, every nest / move / promote, and the pick algorithm with an injected RNG so every
  branch is deterministic.
- **`tests/dom.test.html`** (68 checks) — loads the real app in an iframe with real CSS and real
  `localStorage`. This is where wiring bugs live: that `hidden` elements are actually not displayed,
  that focus survives a chip toggle, that a rename reaches every label, that the starter picker adds
  only what was checked, that a kind change keeps every item, that the two display switches are
  genuinely independent, that a long press opens a list's options while a tap opens the list, that
  subtasks reach the card and never the pool, that a held row drags onto another and a held row that
  never moves changes nothing, that corrupt saved data warns instead of starting silently empty.

Both suites were mutation-checked — the behaviour each one guards was deliberately broken to confirm
the right test turns red. The **card's** swipe is the one gesture neither covers: it needs a real
pointer capture, which synthetic events cannot hold, so swipe-to-skip and swipe-to-accept are
verified by hand. The drag on the list screen is covered — it was built without pointer capture, and
was also driven with real touch input against a running build.

## Lists: two independent axes

A list has a **theme** (what it is about) and a **kind** (how finishing works). They are deliberately
separate, because theme cannot determine mechanics — "Creative" spans both kinds: *sketch for
fifteen minutes* is ongoing, while *finish the album art* is something you check off once.

The theme is just the list's name. The kind decides exactly one thing — whether finishing takes an
item out of the pool — so there are only two:

| Kind | For | Finishing something |
|---|---|---|
| **Check off** | chores, books, errands | takes it out of the hat |
| **Ongoing** | practise guitar, go for a walk | never leaves — each pick logs a session (`3× · last Tuesday`) |

Everything else is presentation, and each part is its own switch on a check-off list:

- **Once something's checked off** — it stays put as a record, or drops into a **Done** pile you can
  clear out.
- **How the list reads** — `2 of 12 done` with a progress bar, or `10 things left`.

These are independent: a chores list can show a progress bar, a reading list can count down what is
left. Schema 1 had a third kind, `checklist`, which was only ever these two switches turned on
together — which is exactly why it felt like a duplicate of `todo` in use. The picker cannot tell
any of it apart; only `kind` ever reaches it.

**The kind is not a commitment.** Change it whenever, from List options — you rarely know which
mechanic fits until you have lived with a list.

Switching is lossless because `done` and `count` are two readings of one fact — *how many times has
this been finished* — and are kept in step:

- Checking something off is itself one completion, so it reads as `1×` if the list becomes Ongoing.
- Logging a session marks it finished, so it reads as checked if the list becomes a check list.
- Unchecking withdraws the completion a check implied, but never a tally built from real sessions —
  uncheck something with ten logged sessions and all ten survive.

An Ongoing list never strikes anything out or shows a Done section, whatever `done` says underneath.

**Colour** is either one of eight palette names or a custom `#rrggbb`. A palette colour rides on a
`c-<name>` class; a custom one sets the `--list-color` CSS variable directly, which is why every hex
is normalised and re-validated at both the storage boundary (`migrate`) and the render boundary
(`paintColor`) — a colour string reaches a stylesheet, so it is never passed through unchecked.

The **+** swatch opens a colour wheel: hue clockwise from the top, saturation outwards from the
white centre, brightness on its own slider, with a hex box for exact values. The wheel is drawn with
a `conic-gradient` and a `radial-gradient` rather than a canvas, so it stays crisp at any pixel
density and needs no redraw — only the marker moves and a black overlay's opacity tracks brightness.
The HSV conversions live in `logic.js` and are unit-tested; the picker itself only does geometry.
Hue and saturation are held as wheel state rather than re-derived from the hex, so dragging through
grey does not lose the angle. Seeding the wheel from the current colour deliberately does *not*
adopt it — opening the picker and closing it must leave a palette list on its palette colour.
Arrow keys drive the wheel too, since a wheel is otherwise pointer-only.

**Starter lists** (offered on a first run, and any time from the Lists screen) are themed, with the
kind that suits them already set: Around the house, Productive, Creative, Get outside, Rest, Learn
something, Books to read, Films to watch. Nothing is preselected — you pick the ones you want, and
they are ordinary lists afterwards, editable and deletable like any other. The ones whose contents
are a matter of taste (books, films) arrive empty on purpose; a suggested reading list would just be
someone else's.

## Subtasks

Anything in a list can be broken into steps with the **+** on its row. They are *parts of one thing*,
never things in their own right:

- **The picker never sees them.** `pool()` walks `list.items`, so a task with six steps has exactly
  the same chance as *wash up* — the alternative hands you a six-step job six times as often.
- **The card carries them.** A pick with steps shows them as a checklist under its title, checkable as
  you go, so "I'm doing it" says what it actually involves. They appear only once the riffle lands,
  never mid-flicker.
- **Steps and their parent are one fact.** Checking the last step finishes the thing, and reopening a
  step reopens it — its siblings are left alone. Checking the thing itself settles all of its steps.
  On an ongoing list, finishing the steps logs a session and clears them for the next time round.
- **Adding one is a burst.** Enter files a step and reopens the field, the way the add row takes
  items. The half-typed text lives in `ui.subDraft`, not the field, so redrawing the list cannot lose
  it — and a blur that a redraw itself caused is ignored rather than treated as leaving the field.

**Rearranging.** Hold a row to pick it up, then drop it:

| Drop | On another thing | On nothing |
|---|---|---|
| a thing | becomes one of its steps | stays where it is |
| a step | moves to that thing | stands on its own again, right after what it came from |

A held press rather than an immediate drag, because the list scrolls — the gesture has to declare
itself before it can take the finger away from the scroller, and once it has, `touchmove` is
cancelled so the list stays put under it. Holding at the top or bottom edge scrolls the list to
the row you are reaching for; the add row and tab bar stop taking the pointer while a drag is live,
since they sit over exactly the part of the list the scroll just brought into reach.

Nesting is **one level deep** — the picker and the card can only show that much — so steps the moved
thing already had arrive beside it rather than underneath. A thing keeps its id through the move, so
nesting and un-nesting is a round trip, not a copy. Every move is one Undo.

A drag is unreachable from a keyboard or a screen reader, so both moves have a shortcut on the
focused row: **Ctrl/⌘ + ↑** files a thing under the one above it, **Ctrl/⌘ + ←** lifts a step back
out. Reordering within a level is deliberately not a gesture here — picking is random, so the order
of a list is not a priority.

## Timers

A list can carry a standing timer length (List options → Timer). Accepting a pick from that list starts
it automatically — no prompt, no duration to choose, because the point of setting one is that you
already decided. A list without one shows `15 / 30 / 45 / 1 hour` on the accepted card instead, so
timing it ad hoc costs one tap. "Set a timer" on the Decide screen covers timing something that was
never a pick.

While it runs, a bar above the tab bar shows the countdown with pause, +5 and stop, on every screen
and within thumb reach.

A timer is stored as **the moment it ends**, not as a countdown, so it stays correct across a reload
or a phone that suspended the tab. When it finishes it plays a tone, vibrates, and posts a
notification if one was permitted.

**The honest limit:** phones suspend a backgrounded web app's timers. The remaining time is always
right when you come back, and it rings reliably while the app is open — but a dependable alarm with
the phone in your pocket needs the native wrap, not a web page.

## Accessibility

Settings (the gear) carries:

- **Text size** — Normal / Large / Larger. Every `font-size` in the stylesheet is in `rem`, so one
  root-level multiplier scales the whole app.
- **Animation** — Match phone / On / Off. "Match phone" follows `prefers-reduced-motion`; the other
  two override it, and both the riffle and the card fly-out obey the result.
- **Read the pick aloud** — speaks the pick through `speechSynthesis`, so you can hit the button and
  hear the answer without looking.
- **Higher contrast** — brightens the muted secondary text and strengthens borders.

Not built on purpose: **voice-to-text**. Android's keyboard mic already dictates into every field
here, and the Web Speech API is Chrome-only and sends audio off-device. Reimplementing it would be
strictly worse than what the phone already does.

One-handed use gets its own attention, since this app is used standing in a kitchen:

- The **system back gesture** leaves a list instead of the app — opening a list pushes a history
  entry, and the in-app back arrow goes through the same path so both behave identically.
- The **add field is pinned to the bottom** of the list screen, not the top: it is the most-used
  control there, and the top of a phone is the hardest place to reach.
- **Dialogs are bottom sheets** on phone-width screens, so their controls land under the thumb.

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

Accepting a pick checks it off on a check-off list, and logs one more session on an ongoing one.
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

**SKIP** and **DOING IT** belong to the stage, not the card: a verdict that rides the card slides off
screen exactly as it becomes worth reading. They hold still while the card moves out from under them,
and reach full strength at 45% of the trigger distance so the word is legible well before the swipe
commits.

Everything that acts on a whole list — edit, delete — lives behind one sheet, reached either by
**holding** a list in the grid or by the **⋯** beside its title. Nothing that edits a list sits next
to the row that adds to one; a held press swallows the click that follows it, so holding a list never
also opens it.

## Storage

One `localStorage` key, `unstuck.v1`:

```jsonc
{
  "schema": 3,
  "settings": { "textScale", "contrast", "motion", "speak" },
  "timer": { "duration", "endsAt", "label", "pausedAt" } | null,
  "lists": [{ "id", "name", "kind", "color", "keepDone", "showProgress", "timerMinutes", "items": [
    { "id", "text", "done", "doneAt", "count", "lastDone", "subs": [
      { "id", "text", "done" }        // a step carries no tally: only its parent is ever picked
    ]}
  ]}],
  "selection": ["<list id>"],   // empty = every list
  "history": ["<item id>"]      // last 40, newest last
}
```

`migrate()` (in `logic.js`) is the single gate every inbound payload passes through — page load and
backup import both. It coerces field types, drops empty items and empty steps, resolves schema 1's
three kinds into the current two-plus-two-switches shape, and throws on anything that isn't shaped
like an Unstuck backup, so a bad import can't corrupt live state. A payload with no `subs` at all —
anything saved before schema 3 — loads with an empty one. It is idempotent, and an upgraded payload is
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
