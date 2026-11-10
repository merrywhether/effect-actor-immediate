# Effect actor timer fairness reproduction

With sustained root-directed internal events, an Effect actor can keep the JavaScript microtask queue busy so timers never get a turn. This repro tests both an XState `after` transition and an unrelated `Effect.timeout` while the actor repeatedly sends itself `TICK`.

## Run

Run with Node 24.16.0 or later and npm.

```sh
npm ci
npm test
```

The lockfile pins the published `@xstate/effect` 1.0.0-beta.0, `xstate` 6.0.0-beta.1 and `effect` 4.1.2. Each worker asserts that its timer fires while the actor is still processing traffic. It stops sending after 1,501 events so a starved timer can fire and report the observed count. A three-second watchdog bounds each worker.

On the pinned betas, `npm test` exits nonzero with `timer fired only after traffic ended (count 1501)` for both tests.
