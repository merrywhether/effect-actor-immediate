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
  schemas: {
    context: types<{ completedChildren: number }>(),
    events: { GO: types<{}>(), PING: types<{}>() },
  },
  actors: { child },
}).createMachine({
  id: 'parent',
  context: { completedChildren: 0 },
  invoke: {
    id: 'child',
    src: 'child',
    onDone: ({ context }) => ({ context: { completedChildren: context.completedChildren + 1 } }),
  },
  on: {
    GO: (_, enq) => enq.sendTo('child', { type: 'WORK' }),
    PING: () => {},
  },
});

for (const sendMethod of ['send', 'sendAndAwait'] as const) {
  test(`restore after ${sendMethod} matches uninterrupted execution`, async () => {
    const program = Effect.gen(function* () {
      const uninterruptedActor = yield* createEffectActor(parent);
      if (sendMethod === 'send') {
        uninterruptedActor.send({ type: 'GO' });
      } else {
        yield* sendAndAwait(uninterruptedActor, { type: 'GO' });
      }

      const immediateSnapshot: PersistedSnapshotOf<typeof parent> = JSON.parse(
        JSON.stringify(uninterruptedActor.getPersistedSnapshot()),
      );

      yield* waitFor(
        uninterruptedActor,
        (snapshot) => snapshot.context.completedChildren === 1,
        { timeout: '1 second' },
      );
      const settledSnapshot: PersistedSnapshotOf<typeof parent> = JSON.parse(
        JSON.stringify(uninterruptedActor.getPersistedSnapshot()),
      );

      const immediateRestoredActor = yield* createEffectActor(parent, { snapshot: immediateSnapshot });
      // PING leaves state unchanged and shows that the restored parent processes new events.
      yield* sendAndAwait(immediateRestoredActor, { type: 'PING' });

      const settledRestoredActor = yield* createEffectActor(parent, { snapshot: settledSnapshot });
      yield* sendAndAwait(settledRestoredActor, { type: 'PING' });

      assert.equal(uninterruptedActor.getSnapshot().context.completedChildren, 1);
      assert.equal(settledRestoredActor.getSnapshot().context.completedChildren, 1);
      assert.equal(
        immediateRestoredActor.getSnapshot().context.completedChildren,
        uninterruptedActor.getSnapshot().context.completedChildren,
        'the restored parent should handle the child completion once, just like uninterrupted execution',
      );
    });

    await Effect.runPromise(Effect.scoped(program));
  });
}
