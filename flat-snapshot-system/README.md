# Snapshot system chain repro

Requires Node.js 24 (verified with 24.16.0). Run:

```sh
npm ci
npm start
```

This pins the published `xstate@6.0.0-beta.1` package and uses `createDurable` from its public experimental `xstate/durable` entry point. `getActorRef` obtains each snapshot's actor. For diagnosis only, the script counts system prototype layers with the internal `_sendInspectionEvent` property. The inspected and send variants read `self`, materializing the snapshot scope; the plain context-only variant does not. Times are observations, not assertions.

Observed on Node 24.16.0: inspected, send, and combined variants reached depths 1,000 and 2,000 at those transition counts; the second 1,000 inspected transitions took 1,383 ms versus 340 ms for the first. The lazy plain control stayed at depth 1. Expected: materialized views remain at a constant depth, and per-step delegation does not grow with the number of previous transitions.

The same issue was separately measured against repository commit `975ba721932b5bc84f77c50a467ae6093e1392cf` on `next`. The published package is not claimed to be byte-identical to that commit.
