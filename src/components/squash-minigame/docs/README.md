# Squash Minigame Docs

Reference for the Pullwatch squash minigame. Each doc anchors to specific files in `src/components/squash-minigame/` and is written for someone touching that area for the first time.

| Doc                                                  | Read it when…                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [simulation-invariants.md](simulation-invariants.md) | You are changing the tick pipeline, adding a phase, or chasing a `tick_ordering` failure.   |
| [mode-rules.md](mode-rules.md)                       | You are tuning a mode, adding a new `GameMode`, or wondering why `legacy` takes two clicks. |
| [store-contract.md](store-contract.md)               | You are touching `GameState`, adding an action, or persisting/restoring round state.        |
| [loop-lifecycle.md](loop-lifecycle.md)               | You are working on the RAF driver, the shell session effect, or checkpoint timing.          |
| [react-bridge.md](react-bridge.md)                   | You are wiring a new component or hook to the store, or debugging an unexpected re-render.  |

Start with `simulation-invariants.md` if you are new — every other doc assumes you know the tick order.
