import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Effect } from 'effect';
import { createEffectActor, waitFor } from '@xstate/effect';
import { sendAndAwait } from '@xstate/effect/test';
import { setup, types, type PersistedSnapshotOf } from 'xstate';
import { createAsyncLogic } from 'xstate/actors';

type Greeting = { greeting: string };

const createFetchMachine = (getGreeting: (name: string) => Promise<Greeting>) =>
  setup({
    schemas: {
      context: types<{ name: string; data: Greeting | null }>(),
      events: { FETCH: types<{}>(), PING: types<{}>() },
    },
    actors: {
      fetchGreeting: createAsyncLogic({
        schemas: { input: types<{ name: string }>() },
        run: ({ input }) => getGreeting(input.name),
      }),
    },
  }).createMachine({
    id: 'fetch',
    initial: 'idle',
    context: { name: 'World', data: null },
    on: { PING: () => {} },
    states: {
      idle: { on: { FETCH: { target: 'loading' } } },
      loading: {
        invoke: {
          id: 'fetchGreeting',
          src: 'fetchGreeting',
          input: ({ context }) => ({ name: context.name }),
          onDone: ({ context, event }) => ({
            target: 'success',
            context: { ...context, data: event.output },
          }),
          onError: { target: 'failure' },
        },
      },
      success: {},
      failure: {},
    },
  });

const expectedGreeting: Greeting = { greeting: 'Hello, World!' };
const fetchMachine = createFetchMachine((name) => Promise.resolve({ greeting: `Hello, ${name}!` }));

test('sendAndAwait: immediate restore should reach success with an already-resolved Promise', async () => {
  const program = Effect.gen(function* () {
    const uninterruptedActor = yield* createEffectActor(fetchMachine);
    yield* sendAndAwait(uninterruptedActor, { type: 'FETCH' });

    const immediateSnapshot: PersistedSnapshotOf<typeof fetchMachine> = JSON.parse(
      JSON.stringify(uninterruptedActor.getPersistedSnapshot()),
    );

    yield* waitFor(uninterruptedActor, (snapshot) => snapshot.matches('success'), {
      timeout: '1 second',
    });
    // A subsequent receipt lets this machine finish the success transition's child cleanup.
    yield* sendAndAwait(uninterruptedActor, { type: 'PING' });
    const settledSnapshot: PersistedSnapshotOf<typeof fetchMachine> = JSON.parse(
      JSON.stringify(uninterruptedActor.getPersistedSnapshot()),
    );

    const immediateRestoredActor = yield* createEffectActor(fetchMachine, {
      snapshot: immediateSnapshot,
    });
    // PING leaves state unchanged and shows that the restored actor processes new events.
    yield* sendAndAwait(immediateRestoredActor, { type: 'PING' });
    // Report a stalled restore as a state mismatch rather than a timeout.
    yield* waitFor(immediateRestoredActor, (snapshot) => snapshot.matches('success'), {
      timeout: '1 second',
    }).pipe(Effect.catchTag('TimeoutError', () => Effect.void));
    const settledRestoredActor = yield* createEffectActor(fetchMachine, {
      snapshot: settledSnapshot,
    });

    assert.equal(uninterruptedActor.getSnapshot().value, 'success');
    assert.deepEqual(uninterruptedActor.getSnapshot().context.data, expectedGreeting);
    assert.equal(settledRestoredActor.getSnapshot().value, 'success');
    assert.deepEqual(settledRestoredActor.getSnapshot().context.data, expectedGreeting);
    assert.equal(
      immediateRestoredActor.getSnapshot().value,
      'success',
      'the restored actor should reach success, just like uninterrupted execution',
    );
    assert.deepEqual(immediateRestoredActor.getSnapshot().context.data, expectedGreeting);
  });

  await Effect.runPromise(Effect.scoped(program));
});

test('sendAndAwait: restoring a still-running invocation reaches success with a slower Promise', async () => {
  const slowerFetchMachine = createFetchMachine(
    (name) =>
      new Promise((resolve) => setTimeout(() => resolve({ greeting: `Hello, ${name}!` }), 0)),
  );
  const program = Effect.gen(function* () {
    const uninterruptedActor = yield* createEffectActor(slowerFetchMachine);
    yield* sendAndAwait(uninterruptedActor, { type: 'FETCH' });
    const immediateSnapshot: PersistedSnapshotOf<typeof slowerFetchMachine> = JSON.parse(
      JSON.stringify(uninterruptedActor.getPersistedSnapshot()),
    );
    assert.equal(uninterruptedActor.getSnapshot().value, 'loading');
    assert.equal(
      uninterruptedActor.getSnapshot().children.fetchGreeting?.getSnapshot().status,
      'active',
    );

    yield* waitFor(uninterruptedActor, (snapshot) => snapshot.matches('success'), {
      timeout: '1 second',
    });
    const immediateRestoredActor = yield* createEffectActor(slowerFetchMachine, {
      snapshot: immediateSnapshot,
    });
    yield* waitFor(immediateRestoredActor, (snapshot) => snapshot.matches('success'), {
      timeout: '1 second',
    });

    assert.deepEqual(uninterruptedActor.getSnapshot().context.data, expectedGreeting);
    assert.deepEqual(immediateRestoredActor.getSnapshot().context.data, expectedGreeting);
  });

  await Effect.runPromise(Effect.scoped(program));
});
