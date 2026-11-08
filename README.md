# XState reproductions

Independent examples for XState issues. Each directory has its own dependency pins, lockfile and run instructions.

| Reproduction | What it demonstrates | Published-package result |
| --- | --- | --- |
| [Effect actor persistence](effect-actor-immediate/) | A completed child's reply is absent from an immediate persisted snapshot | Two recovery tests fail; slower-Promise and native controls pass |
| [Durable pending root events](durable-pending-root-events/) | Post-effects checkpoints omit captured child completions and raised root events | Two recovery tests fail |
| [Snapshot system delegation](flat-snapshot-system/) | Materialized system views grow by one layer per transition | Depth reaches 1,000 and 2,000; the plain control stays at one |

Run each example from its own directory using its README. Expected failures demonstrate the issue on the pinned packages; they are not installation failures. Timing measurements are observations rather than pass/fail thresholds.

This repository was previously named `effect-actor-immediate`. Its original example and history are preserved in [effect-actor-immediate/](effect-actor-immediate/).
