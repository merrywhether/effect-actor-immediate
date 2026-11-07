import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Effect } from 'effect';
import { createEffectActor, waitFor } from '@xstate/effect';
import { sendAndAwait } from '@xstate/effect/test';
import { setup, types, type PersistedSnapshotOf } from 'xstate';

const child = setup({
  schemas: { events: { WORK: types<{}>() } },
}).createMachine({
  id: 'child',
  initial: 'working',
  states: {
    working: { on: { WORK: { target: 'done' } } },
    done: { type: 'final' },
  },
});

const parent = setup({
  schemas: { events: { GO: types<{}>(), PING: types<{}>() } },
  actors: { child },
}).createMachine({
  id: 'parent',
  initial: 'working',
  on: { PING: () => {} },
  states: {
    working: {
      invoke: { id: 'child', src: 'child', onDone: { target: 'success' } },
      on: { GO: (_, enq) => enq.sendTo('child', { type: 'WORK' }) },
    },
    success: {},
  },
});

test('sendAndAwait: restoring a parent with a completed child machine should handle onDone', async () => {
  const program = Effect.gen(function* () {
    const uninterruptedActor = yield* createEffectActor(parent);
    yield* sendAndAwait(uninterruptedActor, { type: 'GO' });
    const immediateSnapshot: PersistedSnapshotOf<typeof parent> = JSON.parse(
      JSON.stringify(uninterruptedActor.getPersistedSnapshot()),
    );

    yield* waitFor(uninterruptedActor, (snapshot) => snapshot.matches('success'), {
      timeout: '1 second',
    });
    // Finish this transition's child cleanup before taking the settled control.
    yield* sendAndAwait(uninterruptedActor, { type: 'PING' });
    const settledSnapshot: PersistedSnapshotOf<typeof parent> = JSON.parse(
      JSON.stringify(uninterruptedActor.getPersistedSnapshot()),
    );

    const immediateRestoredActor = yield* createEffectActor(parent, {
      snapshot: immediateSnapshot,
    });
    yield* sendAndAwait(immediateRestoredActor, { type: 'PING' });
    // Report a stalled restore as a state mismatch rather than a timeout.
    yield* waitFor(immediateRestoredActor, (snapshot) => snapshot.matches('success'), {
      timeout: '1 second',
    }).pipe(Effect.catchTag('TimeoutError', () => Effect.void));
    const settledRestoredActor = yield* createEffectActor(parent, { snapshot: settledSnapshot });

    assert.equal(uninterruptedActor.getSnapshot().value, 'success');
    assert.equal(settledRestoredActor.getSnapshot().value, 'success');
    assert.equal(
      immediateRestoredActor.getSnapshot().value,
      'success',
      'the restored parent should handle onDone from its completed child, just like uninterrupted execution',
    );
  });

  await Effect.runPromise(Effect.scoped(program));
});
