# Restoring an Effect actor can lose a child's completion

`@xstate/effect` documents persisting an actor by acknowledging an event with
`sendAndAwait`, then saving `actor.getPersistedSnapshot()`. See
[Persisting and restoring](https://github.com/statelyai/xstate/blob/c558afa20cb7bda22ac24aaa7f250b523d490ade/packages/xstate-effect/docs/actors.md#persisting-and-restoring).
With ordinary machines, that snapshot can capture a parent still waiting on a
child that has already finished. The restored parent never leaves its waiting
state.

[reproduce.ts](reproduce.ts) uses a typical fetch machine: `FETCH` enters
`loading`, invokes an async `fetchGreeting` actor, and uses `invoke.onDone` to
store the result and enter `success`. [invoke-chain.ts](invoke-chain.ts) invokes
a child state machine instead, with no Promise involved. Each test saves the
actor tree immediately, round-trips it through JSON, and restores it using
unmodified published packages:

| Runtime | Example | Captured parent / child | Result after restore |
| --- | --- | --- | --- |
| Effect, `sendAndAwait` | Fetch, already-resolved Promise | `loading` / `done` | Stuck in `loading` |
| Effect, `sendAndAwait` | Child machine | `working` / `done` | Stuck in `working` |
| Effect, `sendAndAwait` | Fetch, Promise resolves on the next timer turn | `loading` / `active` | Reaches `success`: the running invocation restarts |
| Native `createActor`, `send` | Child machine | `success` | Reaches `success` |

The same results hold with both XState packages built from `next` at
`c558afa20c`, which includes [durable inbox checkpoints](https://github.com/statelyai/xstate/pull/5889).

## Why it gets stuck

`sendAndAwait` acknowledges processing one event and handing off its immediate
effects. It does not wait for the parent to process what those effects cause.
The Effect actor processes each event as a separate item in its own queue, so
when the snapshot is saved, the child has finished but its completion is still
queued for the parent. The persisted snapshot records the finished child and
omits that queued completion. Restoration does not restart a completed child or
deliver its completion again, so the parent's `invoke.onDone` never runs.

Resending the original event doesn't recover the completion. The fetch machine
handles `FETCH` only in `idle`, and in the child-machine example `GO` sends
`WORK` to an already-completed child.

The slower-Promise control shows why this can look reliable: its child is still
running when captured, and restoration restarts it. The native actor runs the
same child-machine example correctly because `send()` processes the whole chain,
including the parent's `onDone`, before it returns. The machines are standard;
the difference is the runtime.

## Run

Use pnpm and a Node version that runs TypeScript files directly (22.18 or later):

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

`pnpm typecheck` passes. **Two tests fail**: the Effect fetch and child-machine
examples remain in `loading` and `working` instead of reaching `success`.
**The slower-Promise and native controls pass.**

Each failing test also checks uninterrupted execution and a restore from a
settled snapshot before asserting the immediate restore. The settled snapshot is
captured after the uninterrupted actor reaches `success` and processes a no-op
`PING`. The immediate restored actor also receives one acknowledged `PING` to
show that it processes new events, then gets up to one second to reach `success`
before the assertion reports its actual state.

Packages are pinned to `xstate` 6.0.0-beta.1, `@xstate/effect` 1.0.0-beta.0 and
`effect` 4.1.2, so a newer prerelease can't silently change the behavior.
