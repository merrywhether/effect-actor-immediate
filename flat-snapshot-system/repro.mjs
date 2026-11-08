import { createMachine } from 'xstate';
import { createDurable } from 'xstate/durable';

const depth = (system) => {
  let count = 0;
  while (system && Object.hasOwn(system, '_sendInspectionEvent')) {
    count++;
    system = Object.getPrototypeOf(system);
  }
  return count;
};

for (const variant of ['inspect', 'send', 'both', 'plain']) {
  const sends = variant === 'send' || variant === 'both';
  const inspection = variant === 'inspect' || variant === 'both';
  const machine = createMachine({
    context: { count: 0 },
    on: {
      TICK: sends || inspection
        ? ({ context, self }, enq) => {
            if (sends) enq.sendTo(self, { type: 'NOOP' });
            return { context: { count: context.count + 1 } };
          }
        : ({ context }) => ({ context: { count: context.count + 1 } }),
      NOOP: () => {}
    }
  });
  const execution = createDurable(machine, {
    executeAction: (effect) => effect.exec(),
    waitForEvent: () => ({ type: 'NOOP' }),
    sendEvent: () => {}
  }, { captureRootEvents: false, ...(inspection ? { inspect: () => {} } : {}) });
  let [snapshot, effects] = execution.initialTransition();
  await execution.executeEffects(effects);
  let last = performance.now();
  for (let i = 1; i <= 2000; i++) {
    [snapshot, effects] = execution.transition(snapshot, { type: 'TICK' });
    await execution.executeEffects(effects);
    if (i % 1000 === 0) {
      const elapsed = Math.round(performance.now() - last);
      const actor = execution.getActorRef(snapshot);
      console.log(`${variant}: ${i} transitions, depth ${depth(actor.system)}, last 1000 ${elapsed} ms`);
      last = performance.now();
    }
  }
}
