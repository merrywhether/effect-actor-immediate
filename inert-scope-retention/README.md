# Earlier snapshots retained after reading `self`

A pure `transition()` loop reads `self.id` during each machine transition. An object appears only in the tenth snapshot's context; the next transition removes it. An otherwise unreferenced earlier context should be collectible while the current snapshot remains alive. In xstate 6.0.0-beta.1, the marker remains reachable through previous materialized actor scopes. The assertion fails after a macrotask and forced garbage collection.

Durable and Effect executions use this pure transition path and can also be affected. Native actors created with `createActor` do not use this path.

This is related to [the snapshot-system delegation issue](https://github.com/statelyai/xstate/issues/5869), which addresses a separate growing system-view chain.

Use Node 24.16.0 and npm. From this directory:

```sh
npm ci
npm run control
npm test
```

The control runs the same machine without reading `self` and passes on the pinned beta. `npm test` reads `self.id` and fails the marker assertion on that beta. Both commands use public XState exports and run Node with `--expose-gc`. Yielding before collection lets V8 release the current job's WeakRef targets. Forced GC is a focused diagnostic, not a general guarantee about collection timing.
