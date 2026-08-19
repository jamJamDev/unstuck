# Where Unstuck is up to

Working notes, last updated 2026-08-19. The README covers how the app works and how to run it —
this is state and direction only.

## Status

Shipped and live at **https://jamjamdev.github.io/unstuck/**, deployed from `main` via GitHub Pages.
100 unit checks (`./test.sh`) and 68 browser checks (`./test.sh --browser`) passing.

Built so far: the picker with rerolls and swipe, two list kinds plus two independent display
switches, subtasks, starter lists, custom colours with a wheel, per-list timers, and accessibility
settings.

**Uncommitted:** drag-to-nest — hold a row to pick it up, drop it on another to file it as a step,
drop a step on nothing to lift it back out. Ctrl/⌘ + ↑ and Ctrl/⌘ + ← do the same without a drag.

The repo is **public**, which it had to be — GitHub Pages will not serve a private repo on the free
plan. Only the code is public; lists live in each device's storage and never leave it.

## Next up

1. **Use the new round for a week**, the same way. The widget's design still depends on what you
   actually want at a glance, and that is not answerable from a chair.

2. **Android home-screen widget.** Needs the native wrap; a PWA cannot provide one. Decisions
   already made:
   - **Capacitor, not Bubblewrap/TWA** — a widget must read the lists, and a TWA leaves them inside
     Chrome's storage where native code cannot reach.
   - `save()`/`load()` route through a storage adapter that also writes Android `SharedPreferences`.
     They are the only two functions that touch storage, so this stays contained.
   - The web app writes a **pre-shuffled queue** of upcoming picks; the widget pops from it. That
     keeps the pick algorithm in `logic.js` only, never reimplemented in Kotlin.
   - Blocked on tooling: no JDK, Android SDK or Android Studio installed. That install is the real
     cost, not the code.

3. **Play Store, then possibly App Store.** Same Capacitor project as the widget. iOS needs a Mac
   with Xcode and a paid Apple developer account.

## Known limits

- **Backgrounded timers.** Phones suspend a web app's timers, so the alarm only rings reliably while
  the app is open. The remaining time is always correct when you return, because a timer is stored
  as the moment it ends. A real pocket alarm needs the native wrap — same blocker as the widget.
- **360x640 screens.** Every field in the edit dialog is on screen at 380x700 and up; on a 360x640
  phone the Timer row needs a small scroll. Fine on anything current.
- **The captured drags are not in either suite.** Synthetic pointer events cannot hold a pointer
  capture, so swipe-to-skip, swipe-to-accept and the colour wheel drag are verified by hand against
  a real touch device. Drag-to-nest deliberately does not use pointer capture — it tracks on
  `document` instead — so that one is covered, including its edge auto-scroll.

## Settled — do not redecide without a reason

- **Theme and kind are separate axes.** "Productive" and "Creative" are list *names*; the kind only
  decides whether finishing removes something from the pool. Every theme spans both kinds.
- **Two kinds, not three.** Schema 1's `checklist` was `todo` with two display switches flipped on,
  which is exactly why the two felt identical in use.
- **Picking is uniform random.** No weights, no priorities — knobs to tune are one more thing to
  stall on.
- **Decisions belong to the list, not the moment.** The per-list default timer exists so accepting a
  pick never asks anything. Count the taps before proposing UI.
- **No voice-to-text.** Android's keyboard mic already dictates into every field, and the Web Speech
  API is Chrome-only and sends audio off-device.
- **Subtasks are parts, not things.** Only their parent is ever picked. Putting steps in the pool
  would hand you a six-step job six times as often as *wash up* — the odds distortion is the whole
  reason, and it is not fixable by weighting without reintroducing knobs.
- **Whole-list actions live in one sheet**, reached by holding a list or by the ⋯ beside its title.
  Nothing that edits a list goes near the row that adds to one: "Edit list" sat above the add row
  and got pressed by a thumb reaching to add an item.
- **Nesting is one level.** Steps of a moved thing arrive beside it, never underneath. A second
  level is not a data problem, it is a card problem — the picked card has room for one checklist.
- **No reordering by drag.** Picking is uniform random, so the order of a list carries no meaning;
  a reorder gesture would only compete with the nest one for the same finger.

## Ideas, not commitments

- Custom timer length per list — the menu is a fixed set of common values right now.
- An in-app override for handedness, if reaching the top-left back arrow ever annoys you. The system
  back gesture already covers most of it.
