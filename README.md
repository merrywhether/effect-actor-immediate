# Restoring an immediate snapshot loses a child's completion

This example has one parent actor and one child. The parent increments
`completedChildren` when it handles the child's `onDone` notification.
The child finishes once, so the expected eventual count is **1**.

The example saves the actor tree immediately after `sendAndAwait(parent, GO)`.
At that point, the child is finished but the parent has not handled its
notification yet: its count is **0**. That is a valid intermediate state.

The problem appears after restoring that checkpoint. The restored parent stays
at **0**, whereas the uninterrupted parent reaches **1**. A parent waiting for
the child before starting its next stage would therefore remain stuck.

## Why the completion is lost

The snapshot saves the child's finished state, but not the completion
notification queued for its parent. Restore does not restart a finished child
or recreate that notification. The parent's `onDone` transition is lost.

The recovery expectation tested here is that a checkpoint of the actor tree
should eventually produce the same parent result as uninterrupted execution,
without running the child's work again. `sendAndAwait` does not promise that
the whole tree has settled; this example asks how to obtain a recoverable
checkpoint when child completion and parent notification straddle the capture.

## Run

Use Node 26 and pnpm 10.33.2:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

`pnpm test` runs the example and checks these cases:

| Observation | Parent's completed-child count |
| --- | --- |
| `immediateSnapshot`: child finished, notification pending | 0 |
| `uninterruptedActor` handles the notification | 1 |
| `immediateRestoredActor` restores `immediateSnapshot` | **0 — expected 1** |
| `settledRestoredActor` restores `settledSnapshot` as a control | 1 |

The checkpoints are JSON-round-tripped. Each restored actor receives one
acknowledged no-op `PING`, showing it can process new events. This is a liveness
check, not a general settlement mechanism. The control shows that restoring an
already-recorded parent result works.

`pnpm typecheck` passes. **`pnpm test` currently fails** on the recovery
expectation: the restored parent has handled zero completions instead of one.

The reproduction uses unmodified published packages pinned to `xstate`
6.0.0-beta.1, `@xstate/effect` 1.0.0-beta.0 and `effect` 4.1.2 so a newer
prerelease cannot silently change the behavior.
