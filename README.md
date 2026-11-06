# Effect actor snapshot reproduction

This is a minimal reproduction using published packages. A parent invokes a
child and handles its `onDone` notification. After `sendAndAwait(parent, GO)`,
the persisted snapshot contains a completed child while the parent has not
processed its notification. The uninterrupted parent processes it; a parent
restored from that snapshot does not in this example.

`sendAndAwait` does not promise to wait for child replies. The question
is how a host can take a recoverable snapshot of a live actor tree when child
completion and its parent notification fall on opposite sides of a checkpoint.

## Run

Use Node 26 and pnpm 10.33.2:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm start
pnpm test
```

`pnpm start` prints the observed values and exits successfully:

```json
{
  "immediateReports": 0,
  "childStatus": "done",
  "uninterrupted": 1,
  "afterRestore": 0,
  "settledRestore": 1
}
```

The immediate checkpoint is JSON-round-tripped. Two subsequent `BARRIER` sends
on the restored actor give initialization and already-queued root notifications
an opportunity to run. A control snapshot taken after the original parent has
processed `onDone` restores with one report. That control illustrates this
example's boundary; it is not a general quiescence or checkpointing guarantee.

`pnpm test` checks the positive controls and the desired equivalence between
the restored and uninterrupted parent. **It currently fails intentionally**:
`afterRestore` is 0 and `uninterrupted` is 1. A passing test would indicate
that the expected report was retained for this example.

Dependencies are pinned to the exact published versions used for the
reproduction (`xstate` 6.0.0-beta.1, `@xstate/effect` 1.0.0-beta.0 and
`effect` 4.1.2), so a newer prerelease cannot silently change the behavior.
