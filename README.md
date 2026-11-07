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

The recovery expectation is that restoring a checkpoint eventually produces
the same parent result as uninterrupted execution. This expectation applies
both before the input has been processed and after it has generated further
work. `sendAndAwait` acknowledges processing of one event; it does not promise
that the whole actor tree has settled.

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
