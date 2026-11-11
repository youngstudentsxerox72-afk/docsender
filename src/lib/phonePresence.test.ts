import assert from "node:assert/strict";
import { it } from "node:test";
import { isPhoneSignalFresh, PHONE_SIGNAL_TIMEOUT_MS } from "./phonePresence";

const now = Date.parse("2026-11-11T13:41:00.000Z");

it("keeps a recent phone heartbeat active for less than 45 seconds", () => {
  assert.equal(PHONE_SIGNAL_TIMEOUT_MS, 45_000);
  assert.equal(isPhoneSignalFresh(new Date(now - 44_999).toISOString(), now), true);
});

it("locks when there is no heartbeat or the heartbeat is 45 seconds old", () => {
  assert.equal(isPhoneSignalFresh(null, now), false);
  assert.equal(isPhoneSignalFresh(new Date(now - 45_000).toISOString(), now), false);
});