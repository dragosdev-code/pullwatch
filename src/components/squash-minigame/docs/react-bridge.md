# React Bridge

> See also: [simulation-invariants.md](simulation-invariants.md) · [mode-rules.md](mode-rules.md) · [store-contract.md](store-contract.md) · [loop-lifecycle.md](loop-lifecycle.md)

The minigame keeps its simulation core off React's render path. Cells, the HUD, the FCT canvas, and the audio engine all read from the same vanilla zustand store the loop drives — but they read it in different ways depending on whether they need a render or just a side effect. This doc explains the patterns and the footguns.

> Anchors below are best-effort line ranges. Refresh them if [`squash-minigame-shell.tsx`](../squash-minigame-shell.tsx), [`context/game-store-context.tsx`](../context/game-store-context.tsx), or the consumer hooks are rewritten.

## The provider

The bridge is a thin context wrapper:

```ts
// context/game-store-context.tsx
const GameStoreContext = createContext<GameStore | null>(null);

export function GameStoreProvider({ store, children }: GameStoreProviderProps) { … }
export function useGameStore(): GameStore { … }
```

The provider does **not** create the store. The shell owns store lifetime ([`squash-minigame-shell.tsx`](../squash-minigame-shell.tsx#L84-L104)) and hands the same `StoreApi` reference into the provider for the lifetime of the session ([L165-L177](../squash-minigame-shell.tsx#L165-L177)). Tests inject deterministic stores; the shell rebuilds the store cleanly across mounts without context churn ([`context/game-store-context.tsx`](../context/game-store-context.tsx#L11-L19)).

`useGameStore()` throws if called outside the provider — that's a developer error, never a runtime fallback.

## Two consumer patterns

| Pattern                                    | Use when                                                          | Triggers React render?                   |
| ------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------- |
| `useStore(store, selector)` from `zustand` | A component's render output depends on the value                  | Yes — when the selector's result changes |
| `store.subscribe(listener)`                | A side effect needs to fire on changes (audio, canvas, telemetry) | No — listener runs outside React         |

Both pull from the same store. The choice is about whether you want to participate in reconciliation or not.

### Atomic selectors with `useStore`

The cell component is the canonical example ([`components/cell/squash-cell.tsx`](../components/cell/squash-cell.tsx#L20-L30)):

```ts
const store = useGameStore();
const target = useStore(store, (s) => s.activeTargets[index] ?? null);
const targetLifetimeMs = useStore(store, (s) => s.config.targetLifetimeMs);
```

Inputs call `clickCell` from primary-button `pointerup` (after `setPointerCapture` on `pointerdown` so a slightly sliding tap still counts) and from `click` for keyboard activation; a trailing synthetic `click` after `pointerup` is deduped.

Each `useStore` call subscribes to **one primitive slice**. Sibling cells subscribe to different indices, so a spawn into cell 4 only re-renders cell 4 — the other eight cells see no work because their selector results are identical-by-`Object.is` to the previous tick.

This works because the store treats `activeTargets` immutably ([store-contract.md](store-contract.md#what-never-mutates-outside-the-store)) — a tick that mutates one slot replaces the whole array, and zustand notifies subscribers; selectors that returned the unchanged sibling slot return the same reference, so React skips them.

#### ⚠️ Zustand v5 footgun: don't return new references

> **Don't write `useStore(store, s => [s.score, s.combo])` or `useStore(store, s => ({ score, combo }))`.** Selectors that return a new object/array literal on every call will trigger React's "Maximum update depth exceeded" loop in zustand v5, because the default equality is `Object.is` and the literal is a new reference every time the store notifies.

Two safe shapes:

- **Split into two atomic selectors**: `const score = useStore(store, s => s.score); const combo = useStore(store, s => s.combo);`
- **Use `useShallow`** from `zustand/react/shallow` if you genuinely need a tuple/object: `useStore(store, useShallow(s => [s.score, s.combo]))`.

The minigame's existing components are entirely the first shape. Stay there unless you have a measured reason to do otherwise.

### Side-effect subscribers with `store.subscribe`

The FCT overlay and audio hook never render based on the store; they react to it. Both follow the same shape ([`fct/fct-overlay.tsx`](../fct/fct-overlay.tsx#L74-L83), [`hooks/use-audio-effects.ts`](../hooks/use-audio-effects.ts#L24-L32)):

```ts
useEffect(() => {
  let lastClickId = store.getState().lastClick?.id ?? -1;
  const unsubscribe = store.subscribe((state) => {
    const click = state.lastClick;
    if (!click || click.id === lastClickId) return; // dedupe
    lastClickId = click.id;
    // … fire side effect (audio, particle spawn) …
  });
  return unsubscribe;
}, [store]);
```

Three things to notice:

1. **Listener fires on every store change.** The current shape subscribes to the whole store; `lastClick.id` is the dedupe key. A tick that doesn't update `lastClick` produces one quick `id === lastClickId` check and exits. Cheap, but not free.
2. **Dedupe on `id`, not `at`.** Two clicks could share the same `at` (`performance.now()` resolution) but never the same `id` — `nextClickId` is monotonic per session ([`game-store.ts`](../game-store.ts#L420-L430)).
3. **Engines live in refs.** The FCT engine and the AudioContext are created lazily inside `useRef` so React renders never churn them ([`fct-overlay.tsx`](../fct/fct-overlay.tsx#L70-L72), [`use-audio-effects.ts`](../hooks/use-audio-effects.ts#L18-L22)).

#### Optional optimisation: `subscribeWithSelector`

If profiling ever flags the per-tick `id === lastClickId` check as meaningful, both subscribers can narrow with `subscribeWithSelector` middleware so the listener only fires when `state.lastClick` actually changes. That's a micro-optimisation, not a present requirement — current measurements don't justify the middleware churn.

## Checkpoint flow

Checkpointing is shell-owned and goes through three pieces:

| Piece                      | Role                                                                                                 | Anchor                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `buildCheckpointFromState` | Pure function: snapshot a `MinigameSessionCheckpoint` from current state, or `null` when not playing | [`build-checkpoint.ts`](../build-checkpoint.ts#L12-L42)               |
| Shell `setInterval`        | Saves every 3 s while `status === 'playing'`                                                         | [`squash-minigame-shell.tsx`](../squash-minigame-shell.tsx#L124-L133) |
| Shell `store.subscribe`    | Clears the saved checkpoint as soon as `status` flips to `'finished'`                                | [`squash-minigame-shell.tsx`](../squash-minigame-shell.tsx#L139-L143) |

The render layer never participates. Components can re-render freely without writing to chrome.storage; the shell **samples checkpoints on a fixed 3s cadence** (not tied to re-render frequency). See [loop-lifecycle.md](loop-lifecycle.md#why-the-periodic-checkpoint-save) for the rationale on interval-vs-cleanup-only.

## Adding a new consumer

A new component or hook that reads the store should pick the smallest tool that fits:

- **Component renders depend on a single primitive** → `useStore(store, s => s.someField)`. One call per field.
- **Component renders depend on multiple fields** → multiple atomic `useStore` calls (preferred), or one `useStore(store, useShallow(s => ({ … })))` if you need a tuple.
- **Hook fires a side effect when something changes** → `store.subscribe` inside `useEffect`, dedupe on a monotonic id (`lastClick.id`, `roundId`), unsubscribe in cleanup.
- **Hook needs to dispatch an action** → `store.getState().action(args)` directly. No selector subscription needed.

Whichever path you take, never read `store.getState()` inline during render — that bypasses the subscription and you'll observe stale state on the next tick.
