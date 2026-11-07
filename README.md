# Restoring an immediate snapshot loses queued work

This example has one parent actor and one child. The parent increments
`completedChildren` when it handles the child's `onDone` notification.
The child finishes once, so the expected eventual count is **1**.

Two independent tests save the actor tree immediately after sending `GO`:

| Send method | Capture point on the pinned versions | Work missing after restore |
| --- | --- | --- |
| `actor.send(GO)` | `GO` is still queued for the parent | The original input |
| `sendAndAwait(actor, GO)` | The child finished, but the parent has not handled its notification | The child's completion notification |

The parent's count is **0** at both capture points. That is a valid intermediate
state. The problem is that restoring either checkpoint leaves the count at
**0**, whereas uninterrupted execution reaches **1**. A workflow waiting for
that completion would therefore remain stuck.

## Why the work is lost

The persisted snapshot records actor state but omits queued messages. In the
plain-send case, the restored tree never receives `GO`. In the acknowledged
case, the snapshot records the finished child, but restore neither restarts
that child nor recreates its missing completion notification.

`sendAndAwait` acknowledges processing of one event; it does not promise
that the whole actor tree has settled. These tests ask whether the captured
snapshot alone is enough to resume the tree and eventually reach the same
parent result as uninterrupted execution.

## What external replay can recover

The plain-send case is not, by itself, evidence of a bug in `actor.send()`:
it does not acknowledge processing. A host could journal `GO` outside XState
and redeliver it after restoring this pre-processing snapshot. More generally,
replaying from an earlier consistent checkpoint requires a journal of the
relevant events and outcomes, with external effects recorded or safe to repeat.
This demo deliberately tests recovery without that additional protocol.

The acknowledged case is harder: the snapshot already includes progress from
`GO`, including the finished child. The original input is still available to
the host, but the missing internal continuation is not another application
command it can simply replay. The parent's `invoke.onDone` handler reacts to
the child's lifecycle; restoring a finished child does not deliver that
notification again. Resending `GO` to this advanced snapshot does not recreate
it either.

Recording actor states therefore does not necessarily preserve a way to
resume every pending interaction. An external journal can support recovery
from an earlier point, but replaying external inputs against an already
advanced snapshot is insufficient. Snapshot-only recovery needs to retain or
reconstruct the pending internal work as well.

## Run

Use Node 26 and pnpm 10.33.2:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

`pnpm test` reports both send methods separately. Each test uses fresh actors
and checks these observations:

| Observation | Parent's completed-child count |
| --- | --- |
| `uninterruptedActor` handles the completion | 1 |
| `immediateRestoredActor` restores `immediateSnapshot` | **0 — expected 1** |
| `settledRestoredActor` restores `settledSnapshot` as a control | 1 |

Both checkpoints are JSON-round-tripped. `immediateSnapshot` is captured
immediately after the selected send method; `settledSnapshot` is captured
after the uninterrupted parent reaches **1**. Each restored actor receives
one acknowledged no-op `PING`, showing it can process new events. That is a
liveness check, not a general settlement mechanism.

`pnpm typecheck` passes. **Both reproduction tests currently fail** on the
recovery expectation: the immediate restored parent has handled zero
completions instead of one. Their uninterrupted and settled-restore controls
pass first.

The reproduction uses unmodified published packages pinned to `xstate`
6.0.0-beta.1, `@xstate/effect` 1.0.0-beta.0 and `effect` 4.1.2 so a newer
prerelease cannot silently change the behavior.
