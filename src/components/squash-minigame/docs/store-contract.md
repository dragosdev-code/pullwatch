# Store Contract

> See also: [simulation-invariants.md](simulation-invariants.md) · [mode-rules.md](mode-rules.md) · [loop-lifecycle.md](loop-lifecycle.md) · [react-bridge.md](react-bridge.md)

The store is a **vanilla zustand store** (`zustand/vanilla`, not `zustand`). The factory is [`createGameStore`](../game-store.ts#L145) and its public surface is `GameState & GameActions`. This doc explains what is stored, what is deliberately not stored, and what the actions guarantee.

> Anchors below are best-effort line ranges. Refresh them when [`game-store.ts`](../game-store.ts) gets a substantial edit.

## Shape

```ts
type GameStore = StoreApi<GameState & GameActions>;
```

`GameState` is the whole observable surface — every field on it is reachable by selectors and is part of the contract. `GameActions` is the mutator set; actions are only ever called from the loop, the shell, or the click handler.

### `GameState` fields ([`game-store.ts`](../game-store.ts#L29-L66))

| Group           | Fields                                                                              | Notes                                                                                               |
| --------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Identity        | `mode`, `config`, `roundId`                                                         | `roundId` is monotonic across `startGame` / `resumeFromCheckpoint` and is the StrictMode dedupe key |
| Status          | `status` (`'idle' \| 'playing' \| 'finished'`)                                      | The loop reads this every frame and self-stops on `'finished'`                                      |
| Grid            | `gridSize`, `activeTargets: (Target \| null)[]`                                     | Length is always `gridSize²`. `null` means "empty cell"                                             |
| Score           | `score`, `combo`, `highestCombo`, `bugsSquashed`, `featuresBroken`                  | All persisted into `MinigameStats` after `onFinish`                                                 |
| Timing          | `startedAt`, `elapsedMs`, `timeRemainingMs`, `nextBugSpawnAt`, `nextFeatureSpawnAt` | All in the `performance.now()` clock                                                                |
| Effects         | `hitStopUntil`, `shakeUntil`                                                        | Render layer reads `shakeUntil`; tick reads `hitStopUntil`                                          |
| Click telemetry | `lastClick: LastClick \| null`, `nextClickId`                                       | FCT and audio dedupe on `lastClick.id`, never on `lastClick.at`                                     |

### `GameActions` ([`game-store.ts`](../game-store.ts#L68-L80))

| Action                                  | Caller                                                | Guarantees                                                                                |
| --------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `startGame(mode, now)`                  | Shell, on mount and replay                            | Resets the grid, reseeds spawn timers from `now`, assigns a fresh `roundId`               |
| `resumeFromCheckpoint(checkpoint, now)` | Shell, when a checkpoint exists on first mount        | Restores counters/timers/`gridSize` only — see below                                      |
| `endGame()`                             | External (e.g. test harness, future "give up" button) | No-op unless `status === 'playing'`; clears the grid, flips status to `'finished'`        |
| `reset()`                               | Shell cleanup                                         | Wipes back to `buildIdleState()` so the next session starts cold                          |
| `tick(now)`                             | Loop                                                  | Single owner of phase ordering — see [simulation-invariants.md](simulation-invariants.md) |
| `clickCell(cellIndex, now)`             | `Cell` component, on pointer click                    | Returns the `ClickOutcome` synchronously and updates `lastClick`                          |

## What lives in the closure, not in state

Some state is **deliberately invisible** to subscribers. The most important is:

```ts
const recentlyDespawned = new Map<number, { target: Target; at: number }>();
```

It lives in the `createGameStore` closure ([`game-store.ts`](../game-store.ts#L149-L155)) and is passed by reference into the helpers that need it — [`applyDespawnsForTick`](../game-tick.ts#L161-L174) writes to it, [`evictExpiredGraceEntries`](../game-tick.ts#L180-L189) prunes it, and [`clickCell`](../game-store.ts#L344-L350) reads from it.

WHY [out of `GameState`]: a `Map` reference would defeat zustand's shallow equality. Every despawn tick would notify every subscribed React component because the map's identity changed, even though no subscribed slice did. Keeping it closure-private makes the despawn race entirely an implementation detail of the store.

If you ever need a similar "loop-only, never observed by React" piece of state, follow the same pattern: declare it inside `createGameStore`, pass it explicitly to the helpers that need it, never put it on `GameState`.

## `resumeFromCheckpoint`: what it restores, what it does not

The persisted checkpoint shape is `MinigameSessionCheckpoint` (defined under the `@common/types` alias at [`extension/common/types.ts`](../../../../extension/common/types.ts); read/write goes through [`storage/session-checkpoint-storage.ts`](../storage/session-checkpoint-storage.ts)). It carries:

- `mode`, `gridSize`
- `score`, `combo`, `highestCombo`, `bugsSquashed`, `featuresBroken`
- `elapsedMs`, `timeRemainingMs`
- `savedAt`

`resumeFromCheckpoint` ([`game-store.ts`](../game-store.ts#L210-L235)) restores all of those, reseeds `startedAt = now - elapsedMs`, and reseeds both spawn timers from the new `now`.

What it **does not** restore: individual `activeTargets`. The grid is rebuilt empty.

WHY [no target restore]: every `Target` carries `spawnedAt` and `despawnAt` in the `performance.now()` clock, which **resets** when the popup re-opens. Persisting those values would either require a clock-translation pass on resume (fragile) or accept that targets snap to dead-on-arrival the moment the player sees them. Starting empty and letting the spawn cadence fill the grid takes ~one `spawnIntervalMs` and feels seamless.

The checkpoint snapshot itself is built by [`buildCheckpointFromState`](../build-checkpoint.ts#L12-L42), which lives outside the store on purpose so both the periodic save and any future `visibilitychange` hook can call it without duplicating field mapping.

## Dependency injection via `createGameStore({ random, generateId })`

The factory accepts an optional `GameStoreDeps` object ([`game-store.ts`](../game-store.ts#L84-L87)):

```ts
interface GameStoreDeps {
  random?: () => number;
  generateId?: () => string;
}
```

Production code passes nothing — the defaults are `Math.random` and a monotonic `target_${n}` counter. Tests inject seeded sources so a tick that picks a "random" empty cell is deterministic. See [`__tests__/tick_ordering.test.ts`](../__tests__/tick_ordering.test.ts#L10-L31) for the canonical wiring; the helpers that consume these deps are [`pickOne`](../game-tick.ts#L27-L29) and [`runSpawnForTick`](../game-tick.ts#L94-L138).

There is also a test-only escape hatch: [`__resetSessionRoundIdForTests`](../game-store.ts#L96-L99) resets the module-scoped `roundId` counter so each test file starts at `roundId = 1`.

## What never mutates outside the store

The simulation core treats `activeTargets` and `LastClick` as **immutable replacements**. Every action that modifies the grid clones the array (`activeTargets.slice()`) before mutating ([`game-store.ts`](../game-store.ts#L367), [L391](../game-store.ts#L391), [L406](../game-store.ts#L406)). [`game-tick.ts`](../game-tick.ts#L114-L115) follows the same rule, copy-on-write keyed off the original buffer reference so spawn and despawn share at most one clone per tick.

This matters because [Cell](../components/cell.tsx#L42-L48) subscribes via `useStore(store, s => s.activeTargets[index])` with the default `Object.is` equality. A mutation in place would skip the re-render; an immutable replacement triggers it. If you add a new mutator, follow the slice-then-set pattern.
