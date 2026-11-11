# Live Phone Radar

## What it will do
- Add a phone page where you enter a temporary pairing code and keep the session active while the page remains open.
- Add a computer setup flow that creates the pairing code and displays it on the maintenance screen.
- Keep mailer pages covered by an “Under maintenance” screen until the paired phone sends a recent signal; lock again after 45 seconds without one.
- Explain that phone browsers may pause signals when the page is backgrounded or the screen is locked, so the phone page needs to remain open and awake.

## Technical details
- Store one user-scoped presence record in Lovable Cloud, protected by authenticated row-level policies and explicit grants.
- Send phone heartbeats every 15 seconds and check presence on the computer every 5 seconds using the existing browser client.
- Keep the phone page separate from the mailer shell so it can reconnect while the computer is locked; require the existing sign-in on both devices.
- Verify code pairing, active unlock, and stale-signal relocking in the preview.
