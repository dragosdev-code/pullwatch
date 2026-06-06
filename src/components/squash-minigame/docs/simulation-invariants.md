# Simulation Invariants

> See also: [mode-rules.md](mode-rules.md) · [store-contract.md](store-contract.md) · [loop-lifecycle.md](loop-lifecycle.md) · [react-bridge.md](react-bridge.md)

This doc encodes the rules the simulation will not break. If you are adding a new mechanic, a new mode, or a new test, read this first. Every claim here is enforced by [`__tests__/tick_ordering.test.ts`](../__tests__/tick_ordering.test.ts) and [`__tests__/game_tick.test.ts`](../__tests__/game_tick.test.ts), so silently violating one of these will turn the suite red.

> Anchors below are best-effort line ranges. Refresh them when a large edit lands in [`game-store.ts`](../game-store.ts) or [`game-tick.ts`](../game-tick.ts).

## The tick pipeline

Each animation frame, the loop calls `store.tick(now)`. That function is the **single owner of end-to-end ordering** ([`game-store.ts`](../game-store.ts#L242-L326)). The phase helpers in [`game-tick.ts`](../game-tick.ts) are leaves: they each do one thing and never call back into the store. The orchestrator sequences them and commits the result.

```
status?  →  hit-stop?  →  expand  →  resize  →  spawn (if !grew)  →  despawn  →  evict grace  →  finished?
```

| Step               | Owner                                                   | Gate                                           | Mutates                                                           |
| ------------------ | ------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| 0. Status guard    | `tick`                                                  | `status !== 'playing'` returns early           | nothing                                                           |
| 0. Hit-stop guard  | `tick`                                                  | `now < hitStopUntil` returns early             | nothing                                                           |
| 1. Expansion       | [`computeExpansionResult`](../game-tick.ts#L40-L52)     | `timeRemainingMs ≤ stage.triggerAtRemainingMs` | derives `gridSize`, `grew`                                        |
| 2. Resize buffer   | [`resizeTargetBuffer`](../game-tick.ts#L58-L67)         | `gridSize² > activeTargets.length`             | pads `activeTargets` (returns same ref otherwise)                 |
| 3. Spawn           | [`runSpawnForTick`](../game-tick.ts#L94-L138)           | **`!grew`** + per-timer `now ≥ nextXSpawnAt`   | bug then feature, each clones `activeTargets` once on first spawn |
| 4. Despawn         | [`applyDespawnsForTick`](../game-tick.ts#L161-L174)     | `target.despawnAt ≤ now`                       | clears slots, records grace entries                               |
| 4b. Grace eviction | [`evictExpiredGraceEntries`](../game-tick.ts#L180-L189) | `now - entry.at > DESPAWN_GRACE_MS`            | mutates closure-scoped map                                        |
| 5. Finished check  | `tick`                                                  | `timeRemainingMs ≤ 0`                          | flips `status` to `'finished'`, clears grid                       |

**Do not split phase ownership across multiple top-level mutators.** Phases would then be free to reorder relative to each other. The `tick_ordering` suite enforces the order above precisely because that ordering is load-bearing for several behaviours.

## Why spawn is skipped on the grow tick

When the grid expands from 3×3 to 4×4 mid-round, the React layout needs **one paint** to place the seven new cells before any target lands inside them. If a bug spawned in cell index 12 on the same tick the grid grew, the player would see it appear in a position that hadn't yet been laid out: at best a flash, at worst a missed click on the wrong rectangle.

The gate is the `grew` boolean returned by [`computeExpansionResult`](../game-tick.ts#L40-L52). [`runSpawnForTick`](../game-tick.ts#L99-L101) bails immediately when `grew === true`, leaving both timers untouched so they fire on the **next** tick.

`tick_ordering.test.ts` pins this behaviour: ["does not spawn on the same tick the grid grows"](../__tests__/tick_ordering.test.ts#L34-L48) and ["spawns normally on the tick after a grid expansion"](../__tests__/tick_ordering.test.ts#L50).

## Why despawn runs after spawn

A target whose `despawnAt` lands on the current tick is still in `activeTargets` when the spawn gate runs. That keeps two invariants simultaneously:

1. **The cell stays occupied during spawn.** A spawn cannot fill a slot the player visually still sees as a bug.
2. **The click that arrived between paints still counts.** When despawn finally moves the target into `recentlyDespawned`, [`clickCell`](../game-store.ts#L344-L350) checks the grace map so the player's click is not silently dropped.

Reverse this order and you get either ghost spawns into "empty" cells the player still sees as bugs, or unfair misses on the last frame of a target's life.

## Timers consume even when the grid is full

Both spawn gates **advance their timer** the moment they fire, regardless of whether an empty cell exists ([`runSpawnForTick`](../game-tick.ts#L117), [L134](../game-tick.ts#L134)). This prevents pending spawns from stacking up on a packed grid: as soon as a slot frees, the next spawn is one full interval away, not "right now plus all the deferred ones."

The `game_tick` suite asserts this: ["consumes the bug timer even when there are no empty cells"](../__tests__/game_tick.test.ts#L207-L223).

## The despawn grace window

`recentlyDespawned: Map<cellIndex, { target, at }>` is the bridge between the loop and click handling. When [`applyDespawnsForTick`](../game-tick.ts#L161-L174) clears a slot, the target lands in this map keyed by its cell index. [`clickCell`](../game-store.ts#L344-L350) consults the map when the cell reads as `null`, and honours the click if `now - entry.at ≤ DESPAWN_GRACE_MS` (50 ms, see [`game-config.ts`](../game-config.ts#L9-L16)).

The map lives in the `createGameStore` closure ([`game-store.ts`](../game-store.ts#L149-L155)), **not** on `GameState`. Two reasons:

- A `Map` reference in zustand state would defeat shallow equality, so every despawn tick would force every subscribed React component to re-evaluate.
- The map is implementation detail of the click-despawn race. UI layers have no reason to read it.

Eviction runs every tick via [`evictExpiredGraceEntries`](../game-tick.ts#L180-L189). The boundary is inclusive: an entry exactly at `DESPAWN_GRACE_MS` survives ([`game_tick.test.ts`](../__tests__/game_tick.test.ts#L281-L286)).

## `roundId` is monotonic across the session

Every `startGame` and `resumeFromCheckpoint` assigns a fresh `roundId` from a module-scoped counter ([`game-store.ts`](../game-store.ts#L89-L94)). This is the StrictMode dedupe primitive: under React's dev-time double-mount, effects that fire `onFinish` or write stats key off `roundId`, not `status`, so they observe each round exactly once. New side effects that react to round transitions should follow the same pattern; see [`hooks/use-finished-reporter.ts`](../hooks/use-finished-reporter.ts) for the canonical shape.

`__resetSessionRoundIdForTests` ([`game-store.ts`](../game-store.ts#L96-L99)) is the test-only reset hook so each suite starts at `roundId = 1`.

## Unit vs integration coverage

- [`__tests__/game_tick.test.ts`](../__tests__/game_tick.test.ts) tests each phase helper in isolation against synthesised inputs. Use this when you change a single phase's algorithm.
- [`__tests__/tick_ordering.test.ts`](../__tests__/tick_ordering.test.ts) drives a real store and asserts cross-phase contracts: the grow-then-spawn gate, the spawn-then-despawn ordering, the grace window honoured by `clickCell`. Use this when you change the orchestrator or add a new phase.

When the two layers disagree, integration wins: a green unit suite with a red `tick_ordering` run means the orchestrator wiring drifted from the helper contract.
