import assert from 'node:assert/strict';
import { Cause, Effect } from 'effect';
import { createMachine } from 'xstate';
import { createEffectActor, waitFor } from '@xstate/effect';

const mode = process.argv[2];
assert.ok(mode === 'after' || mode === 'timeout');
const machine = createMachine({
  context: { count: 0 },
  initial: 'running',
  states: {
    running: {
      ...(mode === 'after' ? { after: { 5: { target: 'expired' } } } : {}),
      on: {
        TICK: ({ context, self }, enq) => {
          if (context.count < 1500) enq.sendTo(self, { type: 'TICK' });
          return { context: { count: context.count + 1 } };
        }
      }
    },
    expired: {}
  }
});

await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const actor = yield* createEffectActor(machine);
  actor.send({ type: 'TICK' });
  if (mode === 'after') {
    const snapshot = yield* waitFor(actor, (state) => state.matches('expired'));
    assert.ok(snapshot.context.count > 0);
    assert.ok(snapshot.context.count < 1501, `after timer fired only after traffic ended (count ${snapshot.context.count})`);
  } else {
    const error = yield* Effect.flip(Effect.never.pipe(Effect.timeout('5 millis')));
    assert.ok(error instanceof Cause.TimeoutError);
    assert.ok(actor.getSnapshot().context.count > 0);
    assert.ok(actor.getSnapshot().context.count < 1501, `Effect.timeout fired only after traffic ended (count ${actor.getSnapshot().context.count})`);
  }
})));
