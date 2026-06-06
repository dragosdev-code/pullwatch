# Mode Rules

> See also: [simulation-invariants.md](simulation-invariants.md) · [store-contract.md](store-contract.md) · [loop-lifecycle.md](loop-lifecycle.md) · [react-bridge.md](react-bridge.md)

The squash minigame ships four `GameMode`s. The simulation engine is **mode-agnostic**: there is no `if (mode === 'legacy')` anywhere in the tick or the components. All variation lives in two tables.

| Source          | What it carries                                    | Anchor                                                              |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| `MODE_CONFIGS`  | Mechanical tuning consumed by the simulation       | `[game-config.ts](../game-config.ts#L83-L123)`                      |
| `MODE_METADATA` | Display strings (label, tagline) for the launchers | `[launcher/mode-metadata.ts](../launcher/mode-metadata.ts#L14-L27)` |

The split exists deliberately: the engine should never read UI strings, and a future localisation pass should never have to touch `MODE_CONFIGS`.

> Anchors below are best-effort line ranges. Refresh them when `MODE_CONFIGS` or `MODE_METADATA` is edited.

## Overview

| Mode           | Duration | Bug cadence | Feature cadence | Lifetime   | Clicks to kill | Grid grows?   |
| -------------- | -------- | ----------- | --------------- | ---------- | -------------- | ------------- |
| `standard`     | 30 s     | 750 ms      | 3,750 ms        | 1,100 ms   | 1              | no            |
| `legacy`       | 30 s     | 850 ms      | 4,250 ms        | 1,500 ms   | **2**          | no            |
| `scopeCreep`   | 30 s     | 750 ms      | 3,750 ms        | 1,100 ms   | 1              | **3 → 4 → 5** |
| `fridayDeploy` | **15 s** | **250 ms**  | 1,250 ms        | **400 ms** | 1              | no            |

Feature cadence is derived: `featureSpawnIntervalMs = round(spawnIntervalMs / FEATURE_SPAWN_PROBABILITY)` where `FEATURE_SPAWN_PROBABILITY = 0.2` (`[game-config.ts](../game-config.ts#L40-L53)`). The two timers are independent inside the simulation so a hot squash streak does not drag features in with it.

The shared scoring constants apply identically to every mode: `PHASE_BASE_POINTS = { fresh: 10, middle: 5, final: 2 }`, `COMBO_SCORE_MULTIPLIER_CAP = 10`, `POINTS_PER_FEATURE = -20`, `HIT_STOP_MS = 50`, `SCREEN_SHAKE_MS = 300`, and `DESPAWN_GRACE_MS = 50` (`[game-config.ts](../game-config.ts#L1-L38)`).

## standard

> "three by three. thirty seconds. squash."

The reference experience. 3×3 grid, balanced spawn rhythm, a 1.1-second target lifetime that gives a player time to see and squash without rewarding hesitation. Use this as the baseline when comparing the others.

## legacy

> "two clicks per bug. crusty old codebase."

The only mode where `bugClicksToKill = 2` (`[game-config.ts](../game-config.ts#L99)`). A first hit advances `damageStage` from 0 to 1 and emits a `bug_cracked` outcome (`[game-store.ts](../game-store.ts#L388-L404)`); a second hit on the same target produces the squash. Cadence is slightly slower (850 ms) and lifetime slightly longer (1.5 s) so the two-tap rhythm stays fair.

## scopeCreep

> "grid grows as the deadline shrinks."

Same baseline as `standard` plus a `gridExpansionSchedule` that fires twice (`[game-config.ts](../game-config.ts#L109-L112)`):

| Trigger (`timeRemainingMs ≤`) | New `gridSize` |
| ----------------------------- | -------------- |
| 20,000 ms                     | 4              |
| 10,000 ms                     | 5              |

Each expansion happens on a tick where the spawner is **paused for one frame** so React can lay out the new cells before anything spawns into them. See [Why spawn is skipped on the grow tick](simulation-invariants.md#why-spawn-is-skipped-on-the-grow-tick).

The schedule is read inside `[computeExpansionResult](../game-tick.ts#L40-L52)`. Stages must be sorted ascending by `triggerAtRemainingMs`; the loop intentionally walks them all so a player who arrives mid-round at `timeRemaining = 5,000` jumps straight to `gridSize = 5` (`[game_tick.test.ts](../__tests__/game_tick.test.ts#L80-L83)`).

## fridayDeploy

> "fifteen seconds. triple spawn rate. good luck."

The high-pressure variant: half the duration, ~3× the spawn rate, target lifetime cut to 400 ms (under half a second). The grid stays 3×3, but the target turnover is fast enough that any hesitation collapses combo. `targetLifetimeMs = 400` is short enough that the despawn grace window (50 ms) is a meaningful fraction of a target's life, so fairness depends on it.

## Adding a mode

A new mode is two table entries:

1. Extend the `GameMode` union in `@common/types`.
2. Add a `MODE_CONFIGS[newMode]` entry. The type `Record<GameMode, ModeConfig>` (`[game-config.ts](../game-config.ts#L83)`) makes this exhaustive, so TypeScript fails the build until the entry exists.
3. Add a `MODE_METADATA` entry for the launcher buttons (`[launcher/mode-metadata.ts](../launcher/mode-metadata.ts#L14-L27)`).

If the mode needs **mechanics that the existing fields cannot express** (a custom scoring rule, a bespoke spawn algorithm, a cooldown after combo break), promote `ModeConfig` from a pure data record to a strategy object holding optional pure functions. Keep the table: the engine stays generic, the orchestrator still owns total tick order, and only the modes that need the new behaviour pay the cost.

If the mode is just new numbers, leave the shape alone. The data table is doing exactly the job a class hierarchy would, with less ceremony.
