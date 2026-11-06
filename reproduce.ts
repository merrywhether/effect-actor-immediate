import assert from 'node:assert/strict';
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
    context: types<{ reports: number }>(),
    events: { GO: types<{}>(), BARRIER: types<{}>() },
  },
  actors: { child },
}).createMachine({
  id: 'parent',
  context: { reports: 0 },
  invoke: {
    id: 'child',
    src: 'child',
    onDone: ({ context }) => ({ context: { reports: context.reports + 1 } }),
  },
  on: {
    GO: (_, enq) => enq.sendTo('child', { type: 'WORK' }),
    BARRIER: () => {},
  },
});

const program = Effect.gen(function* () {
  const actor = yield* createEffectActor(parent);
  yield* sendAndAwait(actor, { type: 'GO' });

  // Persist exactly at the send receipt; no later mailbox event has been awaited.
  const immediate: PersistedSnapshotOf<typeof parent> = JSON.parse(
    JSON.stringify(actor.getPersistedSnapshot()),
  );
  const childStatus = actor.getSnapshot().children.child?.getSnapshot().status;
  const immediateReports = immediate.context.reports;

  // The uninterrupted actor processes the child's completion.
  yield* waitFor(actor, (snapshot) => snapshot.context.reports === 1, { timeout: '1 second' });
  const uninterrupted = actor.getSnapshot().context.reports;
  const settled: PersistedSnapshotOf<typeof parent> = JSON.parse(
    JSON.stringify(actor.getPersistedSnapshot()),
  );

  const restored = yield* createEffectActor(parent, { snapshot: immediate });
  // Two public sends give initialization and queued notifications an opportunity to run.
  yield* sendAndAwait(restored, { type: 'BARRIER' });
  yield* sendAndAwait(restored, { type: 'BARRIER' });
  const afterRestore = restored.getSnapshot().context.reports;

  const control = yield* createEffectActor(parent, { snapshot: settled });
  yield* sendAndAwait(control, { type: 'BARRIER' });
  const settledRestore = control.getSnapshot().context.reports;

  return { immediateReports, childStatus, uninterrupted, afterRestore, settledRestore };
});

const result = await Effect.runPromise(Effect.scoped(program));
console.log(JSON.stringify(result, undefined, 2));

if (process.argv.includes('--check')) {
  // Check the uninterrupted result and the settled-snapshot control first.
  assert.equal(result.uninterrupted, 1);
  assert.equal(result.settledRestore, 1);
  assert.equal(result.afterRestore, result.uninterrupted, 'immediate checkpoint should restore the parent report');
}
