# Where Unstuck is up to

Working notes, last updated 2026-08-19. The README covers how the app works and how to run it —
this is state and direction only.

## Status

Shipped and live at **https://jamjamdev.github.io/unstuck/**, deployed from `main` via GitHub Pages.
115 unit checks (`./test.sh`) and 88 browser checks (`./test.sh --browser`) passing.

Built so far: the picker with rerolls and swipe, two list kinds plus two independent display
switches, subtasks, starter lists, custom colours with a wheel, per-list timers, and accessibility
settings.

**Uncommitted:** the app's own colour is now a setting — the same eight swatches and the same wheel a
list gets. The wheel moved into its own dialog with two owners rather than being duplicated, and the
hex box now takes `rgb()` as well. One accent is stored; the gradient ends and the ink on top are
derived, so nothing can drift out of step with it.

Also uncommitted: the list's **⋯ Options** control became a labelled pill in the list's colour. It was
a bare grey glyph 8px from the app's gear, in the same corner and the same grey, and the gear kept
catching the thumb aimed at it. Colour alone would have fixed one of the four things that made them
look alike; the pill differs in shape, size, colour and content. The sheet's first row now reads
"Edit list details" rather than "Edit name, kind and colour".

Also uncommitted, an accessibility round — a legibility floor for custom list colours, 24px-minimum
touch targets in list rows, "Match phone" for contrast, and the dead CSS from the old kind picker
removed.

The week-of-use round before it (`88bf31f`..`db0ec62`) landed drag-to-reorder alongside
drag-to-nest, an escape from the standalone timer ask, a Custom timer length, and the Ko-fi tip jar.
Git holds the detail; two lessons from it are worth keeping here:

- **A touch listener registered late is a listener that does nothing.** The nesting drag failed on a
  real phone because the non-passive `touchmove` that stops the list scrolling was registered when
  the row lifted, half a second in — but a browser fixes whether a touch may scroll as the touch
  *starts*, counting only the blocking listeners already present. Registered at startup now.
- **Neither suite can catch that class of bug.** Synthetic pointer events and CDP touch both bypass
  the scroll decision entirely, so it took a phone in a hand. Assume the same of anything else that
  depends on how a browser interprets a *gesture* rather than an event.

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
- **Whole-list actions live in one sheet**, reached by holding a list or by the ⋯ Options pill beside
  its title. Nothing that edits a list goes near the row that adds to one: "Edit list" sat above the
  add row and got pressed by a thumb reaching to add an item. The pill is labelled and tinted because
  the bare glyph then lost to the app's gear, 8px away in the same corner — twice now, a control on
  this screen has been mistaken for its neighbour, so proximity is the thing to design against here.
- **Nesting is one level.** Steps of a moved thing arrive beside it, never underneath. A second
  level is not a data problem, it is a card problem — the picked card has room for one checklist.
- **One drag does both nesting and reordering**, split by where on the target row the finger lets
  go: the middle files in, either edge inserts. Two gestures for one finger would have been the
  worse answer. Order still means nothing to the picker on any kind of list — it is uniform random
  regardless — but it makes a long list readable, which is why it earns the gesture.
- **Free, no ads, nothing paywalled — a tip jar instead.** An ad would sit in the exact moment the
  app exists to smooth over, and would cost the "nothing leaves the device" promise (tracking SDK,
  consent prompt, privacy policy) for a few dollars a month at realistic install numbers. A paid
  timer fails differently: time-boxing is core to getting unstuck, so charging for it reads as
  "why isn't that just free". The tip unlocks nothing on purpose.
- **A colour is lifted for text, never replaced.** The wheel can produce a colour that cannot be read
  on the card, and refusing it would make the wheel feel broken. The chosen colour still paints edges
  and dots; only its text reading is raised to 4.5:1, as `--list-ink`.

## Ideas, not commitments

- A typed length in **List options → Timer** as well. The offer on the card takes one now; the
  per-list standing length is still a fixed menu.
- An in-app override for handedness, if reaching the top-left back arrow ever annoys you. The system
  back gesture already covers most of it.
