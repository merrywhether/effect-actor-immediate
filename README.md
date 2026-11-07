# Restoring a loading actor can lose its completion

This example uses a typical fetch machine: `FETCH` enters `loading`, invokes
an async `fetchGreeting` actor, and uses `invoke.onDone` to store the result
and enter `success`. Uninterrupted execution reaches `success` with
`{ greeting: 'Hello, World!' }`.

The tests save the actor tree immediately after sending `FETCH`, then restore
that JSON snapshot using unmodified published packages:

| Send method | Promise | Captured parent / child | Result after restore |
| --- | --- | --- | --- |
| `actor.send(FETCH)` | Already resolved | `idle` / not started | Stuck in `idle`: input was queued but not saved |
| `sendAndAwait(actor, FETCH)` | Already resolved | `loading` / `done` | Stuck in `loading`: completion was queued but not saved |
| `sendAndAwait(actor, FETCH)` | Resolves on the next timer turn | `loading` / `active` | Reaches `success`: the running invocation restarts |

## Why the already-resolved case gets stuck

`sendAndAwait` acknowledges processing `FETCH` and handing off its immediate
effects; it does not wait for the invoked request or its completion to be
processed by the parent. On the pinned versions, an already-resolved Promise
finishes the child before this checkpoint, while the parent is still waiting
to handle its completion notification.

The persisted snapshot records `loading` and the finished child, but omits the
queued notification. Restoration does not restart a completed child or deliver
its completion again. The parent's `invoke.onDone` therefore never runs, and
the greeting remains `null`.

The slower-Promise control resolves on the next timer turn, so the child is
still active when captured. Restoration restarts that invocation, whose new
completion reaches the parent. This shows why the pattern can appear reliable
with a slower request while failing with an already-resolved Promise.

A second example in [invoke-chain.ts](invoke-chain.ts) invokes a child state
machine instead of an async request. Completing the child leaves its parent's
`onDone` notification queued; restoration strands the parent in `working`
instead of `success`. No Promise is involved in that child machine.

The plain-send case loses work earlier: `FETCH` is still queued when captured,
so the parent is still `idle` and no request has started. Its failure does not
depend on how quickly the request would resolve. We include `actor.send()`
only to show that preserving the inbox would also recover this queued external
input, alongside the internal completion notifications.

## What external replay can recover

The plain-send case is not, by itself, evidence of a bug in `actor.send()`:
it does not acknowledge processing. A host could journal `FETCH` outside XState
and redeliver it after restoring this pre-processing snapshot. More generally,
replaying from an earlier consistent checkpoint requires a journal of the
relevant events and outcomes, with external effects recorded or safe to repeat.
This demo tests recovery without that additional protocol.

The acknowledged case is harder: the snapshot already includes progress from
`FETCH`, including the finished child. The host can resend the external input,
but this machine does not handle `FETCH` in `loading`, so doing so would not
recreate the missing lifecycle notification. Recording actor states does not
necessarily preserve a way to resume every pending interaction. Snapshot-only
recovery needs to retain or reconstruct that pending internal work as well.

## Run

Use Node 26 and pnpm 10.33.2:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

`pnpm typecheck` passes. **Three reproduction tests fail**: the fetch examples
remain in `idle` and `loading`, and the child-machine example remains in
`working`, instead of reaching `success`. **The slower-Promise control passes.**

Each reproduction also checks uninterrupted execution and a settled-snapshot
restore before asserting the failing immediate restore. The fetch examples
also check the greeting data. `immediateSnapshot` is captured immediately after
the selected send method; `settledSnapshot` is captured after the uninterrupted actor reaches
`success` and processes a subsequent no-op `PING`, letting that transition's
child cleanup finish. Both are JSON-round-tripped. The immediate restored actor
receives one acknowledged no-op `PING` to show that it processes new events;
this is a liveness check, not a settlement mechanism. Each immediate restore gets up to
one second to reach `success` before the assertion reports its actual state.

The reproduction uses packages pinned to `xstate` 6.0.0-beta.1,
`@xstate/effect` 1.0.0-beta.0 and `effect` 4.1.2 so a newer prerelease cannot
silently change the behavior.
