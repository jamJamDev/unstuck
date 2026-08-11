# Where Unstuck is up to

Working notes, last updated 2026-08-10. The README covers how the app works and how to run it —
this is state and direction only.

## Status

Shipped and live at **https://jamjamdev.github.io/unstuck/**, deployed from `main` via GitHub Pages.
Working tree clean, everything pushed. 81 unit checks (`./test.sh`) and 43 browser checks
(`./test.sh --browser`) passing.

Built so far: the picker with rerolls and swipe, two list kinds plus two independent display
switches, starter lists, custom colours with a wheel, per-list timers, and accessibility settings.

The repo is **public**, which it had to be — GitHub Pages will not serve a private repo on the free
plan. Only the code is public; lists live in each device's storage and never leave it.

## Next up

1. **Use it for a week.** Deliberate — the widget's design depends on what you actually want at a
   glance, and that is not answerable from a chair. Everything below can wait behind this.

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
- **The drag gesture is not in either suite.** Synthetic pointer events cannot hold a pointer
  capture, so swipe-to-skip, swipe-to-accept and the colour wheel drag are verified by hand against
  a real touch device.

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

## Ideas, not commitments

- Custom timer length per list — the menu is a fixed set of common values right now.
- An in-app override for handedness, if reaching the top-left back arrow ever annoys you. The system
  back gesture already covers most of it.
