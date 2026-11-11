/** Phone signals stay valid for less than 45 seconds on the computer. */
export const PHONE_SIGNAL_TIMEOUT_MS = 45_000;

export function isPhoneSignalFresh(heartbeatAt: string | null, now = Date.now()): boolean {
  if (!heartbeatAt) return false;
  const signalTime = Date.parse(heartbeatAt);
  const age = now - signalTime;
  return Number.isFinite(signalTime) && age >= -15_000 && age < PHONE_SIGNAL_TIMEOUT_MS;
}