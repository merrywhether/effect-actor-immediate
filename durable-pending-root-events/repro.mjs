import assert from "node:assert/strict";
import { test } from "node:test";
import { createMachine, createStepLogic, deliverEvent, stopActor } from "xstate";
import { createDurable } from "xstate/durable";

const adapter = () => ({
  executeAction: (action) => action.exec(),
  waitForEvent: () => ({ type: "PING" }),
  spawnActor: () => {},
  startActor: (actor) => {
    actor.start();
  },
  stopActor,
  sendEvent: deliverEvent,
});
const json = (value) => JSON.parse(JSON.stringify(value));

const child = createMachine({
  initial: "waiting",
  states: {
    waiting: { on: { WORK: { target: "done" } } },
    done: { type: "final" },
  },
});
const parent = createMachine({
  id: "parent",
  actors: { child },
  initial: "working",
  states: {
    working: {
      invoke: { id: "child", src: "child", onDone: { target: "success" } },
      on: { GO: ({ children }, enq) => enq.sendTo(children.child, { type: "WORK" }) },
    },
    success: {},
  },
});
test("restores a captured child completion", async () => {
  const original = createDurable(parent, adapter());
  let [state, effects] = original.initialTransition();
  await original.executeEffects(effects);
  [state, effects] = original.transition(state, { type: "GO" });
  await original.executeEffects(effects);
  // This is the documented checkpoint boundary: all effects have settled.
  const checkpoint = json(parent.getPersistedSnapshot(state));
  assert.equal(checkpoint.value, "working");
  assert.equal(checkpoint.children.child.snapshot.status, "done");
  const liveEvent = await original.waitForEvent();
  assert.equal(liveEvent.type, "xstate.done.actor");
  assert.equal(original.transition(state, liveEvent)[0].value, "success");
  const resumed = createDurable(parent, adapter());
  let [restored, restoreEffects] = resumed.restore(checkpoint);
  await resumed.executeEffects(restoreEffects);
  const event = await resumed.waitForEvent();
  [restored] = resumed.transition(restored, event);
  assert.equal(restored.value, "success");
});

const logic = createStepLogic({
  context: { count: 0 },
  run: ({ event, context }, enq) => {
    if (event.type === "GO") enq.raise({ type: "INC" });
    if (event.type === "INC") return { context: { count: context.count + 1 } };
  },
});
test("restores a captured generic raised event", async () => {
  const generic = createDurable(logic, adapter());
  let [genericState, genericEffects] = generic.initialTransition();
  await generic.executeEffects(genericEffects);
  [genericState, genericEffects] = generic.transition(genericState, { type: "GO" });
  await generic.executeEffects(genericEffects);
  const genericCheckpoint = json(generic.getActorRef(genericState).getPersistedSnapshot());
  const liveEvent = await generic.waitForEvent();
  assert.equal(liveEvent.type, "INC");
  assert.equal(generic.transition(genericState, liveEvent)[0].context.count, 1);
  const genericResumed = createDurable(logic, adapter());
  let [genericRestored, genericRestoreEffects] = genericResumed.restore(genericCheckpoint);
  await genericResumed.executeEffects(genericRestoreEffects);
  const genericEvent = await genericResumed.waitForEvent();
  [genericRestored] = genericResumed.transition(genericRestored, genericEvent);
  assert.equal(genericRestored.context.count, 1);
});
