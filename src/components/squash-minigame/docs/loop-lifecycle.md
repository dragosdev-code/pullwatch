# Loop Lifecycle

> See also: [simulation-invariants.md](simulation-invariants.md) · [mode-rules.md](mode-rules.md) · [store-contract.md](store-contract.md) · [react-bridge.md](react-bridge.md)

The minigame's heartbeat is a tiny RAF driver in [`game-loop.ts`](../game-loop.ts). It does one thing — call `store.tick(now())` every animation frame for as long as the round is `playing` — and the shell ([`squash-minigame-shell.tsx`](../squash-minigame-shell.tsx)) is the only thing that wires it up. This doc is the contract between those two pieces.

> Anchors below are best-effort line ranges. Refresh them if [`game-loop.ts`](../game-loop.ts) or the session effect in [`squash-minigame-shell.tsx`](../squash-minigame-shell.tsx) is rewritten.

## `createGameLoop(store, deps?)`

The factory ([`game-loop.ts`](../game-loop.ts#L29-L61)) returns a `GameLoop`:

```ts
interface GameLoop {
  start(): void;
  stop(): void;
  isRunning(): boolean;
}
```

All three methods are safe to call repeatedly — `start` is idempotent, `stop` is idempotent, and the loop **self-stops** when `store.status !== 'playing'`. There is no need to chase teardown when the round ends naturally; the next scheduled frame sees the new status and stops requesting more frames ([`game-loop.ts`](../game-loop.ts#L38-L44)).

The optional `deps` ([`game-loop.ts`](../game-loop.ts#L3-L10)) replace `performance.now`, `requestAnimationFrame`, and `cancelAnimationFrame` — the seam exists for tests that want to drive the loop manually (see [`__tests__/game_loop.test.ts`](../__tests__/game_loop.test.ts)).

## What happens per frame

```
requestFrame(tick)
   └→ tick callback
        ├ handle = null            ← clear before re-arming so re-entry is safe
        ├ store.getState().tick(now())
        └ if status === 'playing': handle = requestFrame(tick)
```

The interesting bits:

- **`handle = null` before the call.** If `tick` synchronously flips status to `'finished'`, the callback returns without re-arming and the loop is parked. Setting `handle` to `null` first means `isRunning()` reports the truth even if the user inspects it inside a subscriber that fires during `tick`.
- **Empty body when `now < hitStopUntil`.** The 50 ms hit-stop window after a successful squash ([`game-config.ts`](../game-config.ts#L3-L4)) is enforced inside `store.tick` ([`game-store.ts`](../game-store.ts#L266)) — the loop keeps spinning so renders continue, but the simulation pauses. Hit-stop is not a loop concern.

## Idempotent `start`

The shell calls `start()` exactly once per session, but **React StrictMode mounts every effect twice in dev**. The guard ([`game-loop.ts`](../game-loop.ts#L47-L51)) does two things:

1. If a frame is already pending (`handle !== null`), return without scheduling a second one.
2. If the store is not in `'playing'` (e.g. the test harness is between sessions), don't schedule anything — `tick` would early-return anyway, but skipping the schedule keeps the dev console quiet.

This means `loop.start(); loop.start();` is harmless. Same for the StrictMode double-invocation: the second call is a no-op and the loop runs at exactly the host refresh rate.

## How the shell builds and tears down the loop

The session lives entirely inside one effect in [`squash-minigame-shell.tsx`](../squash-minigame-shell.tsx#L99-L159), keyed on `[mode, replayToken]`. Reading the effect top-to-bottom:

1. **Build store, build loop.** The shell holds the factories (`createStoreFn`, `createLoopFn`) in refs so a re-render with a new lambda doesn't churn the effect ([L86-L93](../squash-minigame-shell.tsx#L86-L93)). Defaults are `() => createGameStore()` and `(store) => createGameLoop(store)`.
2. **Decide between resume and fresh start.** If a `checkpoint` prop is present and has not been consumed yet, call `resumeFromCheckpoint`; otherwise `startGame(mode, performance.now())` ([L106-L112](../squash-minigame-shell.tsx#L106-L112)). The consumed flag is a ref so a re-render after the first mount doesn't re-resume.
3. **`nextLoop.start()`.** From this point the simulation is live.
4. **Periodic checkpoint save.** A `setInterval` saves a checkpoint every 3 seconds while `status === 'playing'` ([L124-L133](../squash-minigame-shell.tsx#L124-L133)). See below for why this is interval-based, not cleanup-only.
5. **Subscribe for finish-clears-checkpoint.** A `store.subscribe` listener clears the persisted checkpoint as soon as `status` flips to `'finished'` so the next popup open doesn't show a paused overlay for a completed round ([L139-L143](../squash-minigame-shell.tsx#L139-L143)).
6. **Cleanup.** On unmount or when `[mode, replayToken]` changes, the effect clears the interval, unsubscribes, calls `loop.stop()`, attempts a best-effort last-second checkpoint save, and calls `store.reset()` so the next session starts from a clean idle state ([L145-L158](../squash-minigame-shell.tsx#L145-L158)).

## Why the periodic checkpoint save

`chrome.storage.local.set` is asynchronous. When the extension popup closes — user clicks outside, presses `Escape`, switches windows — the JS context is destroyed before the cleanup function's pending write can complete. Relying on cleanup-only saves means anyone closing mid-round loses their progress.

The 3-second cadence is the compromise: rare enough not to hammer `chrome.storage` during gameplay, frequent enough that at most 3 seconds of progress is at risk ([`squash-minigame-shell.tsx`](../squash-minigame-shell.tsx#L115-L122) carries the rationale inline). The cleanup write is still attempted as a best-effort backup but is not relied on.

## `replayToken` and same-mode replay

When the player taps "try again" on the finished overlay, the shell bumps `replayToken` ([L172](../squash-minigame-shell.tsx#L172)). The session effect's deps `[mode, replayToken]` ([L159](../squash-minigame-shell.tsx#L159)) cause a clean teardown + rebuild without changing the `mode` prop. This is the same path a mode change would take, so there's only one code path to reason about for "start a new round."

## StrictMode expectations

In dev, every effect runs `mount → cleanup → mount` to surface bugs. The shell + loop survive that without help because:

- `start()` and `stop()` are idempotent (above).
- The store is rebuilt on each mount, so the second mount creates a fresh store and the first store is GC'd. Two stores never coexist.
- `roundId` is monotonic across `startGame` calls ([store-contract.md](store-contract.md#shape)), so any side effect that needs "fire once per round" — `onFinish`, stat persistence, audio cues — keys off `roundId` instead of `status` and dedupes correctly under double-mount.

If you add a new effect that reacts to round transitions, follow the `roundId` dedupe pattern. See [`hooks/use-finished-reporter.ts`](../hooks/use-finished-reporter.ts) for the canonical shape.
