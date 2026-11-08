import assert from 'node:assert/strict';
import { createMachine, initialTransition, transition } from 'xstate';

assert.equal(typeof globalThis.gc, 'function', 'Run with node --expose-gc');
const readSelf = !process.argv.includes('--control');
const machine = createMachine({
  context: { count: 0, marker: undefined },
  on: {
    TICK: (args) => {
      if (readSelf) void args.self.id;
      return {
        context: {
          count: args.context.count + 1,
          marker: args.context.count === 9 ? {} : undefined
        }
      };
    }
  }
});
let [snapshot] = initialTransition(machine);
let marker;
for (let i = 0; i < 100; i++) {
  [snapshot] = transition(machine, snapshot, { type: 'TICK' });
  if (i === 9) marker = new WeakRef(snapshot.context.marker);
}
await new Promise((resolve) => setImmediate(resolve));
for (let i = 0; i < 4; i++) globalThis.gc();
assert.equal(marker.deref(), undefined, 'The old context marker should be collectible');
assert.equal(snapshot.context.count, 100);
