# Durable pending root events repro

Requires Node.js 24 and npm. Run:

```sh
npm ci
npm test
```

The pinned published `xstate@6.0.0-beta.1` reproduces both cases. Both tests assert the expected recovery and fail on this beta: the child remains working and the generic count remains zero. Each test also asserts that the uninterrupted execution processes its captured event. It uses only public package exports and checkpoints after `executeEffects` resolves. Tested with Node 24.16.0 on 2026-11-07. The separate pristine `next` source baseline was commit `975ba721932b5bc84f77c50a467ae6093e1392cf`; the published beta is not assumed to be identical to that commit.
