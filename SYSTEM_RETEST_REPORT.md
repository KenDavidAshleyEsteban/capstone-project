# Gunpla Hub system retest

Date: October 28, 2026 (Asia/Manila)

## Current result

The eight prioritized security, account-isolation, verification, buyer-workflow,
and database-testing items have been implemented and checked locally. Tests use
real Express HTTP endpoints and disposable MongoDB replica sets. No application
or production database was used, and no real email was sent.

| Check | Result |
| --- | --- |
| `npm run test:integration` | 63 passed, 0 failed, 0 skipped |
| `npm run test:browser` | 24 checks passed using real API responses and an isolated Edge profile |
| JavaScript syntax | 63 application/test files passed; dependencies and bundled vendors excluded |
| HTML asset references | All local script and stylesheet paths exist |
| `git diff --check` | Passed |
| `npm audit --json` | 0 reported vulnerabilities |
| Startup and admin seeding smoke | Invalid email configuration rejected before startup; explicit seeded admin signed in successfully |

## Prioritized work completed

| Priority | Original finding | Result |
| --- | --- | --- |
| Critical | Fallback admin password and automatic admin creation during login | Removed. Login authenticates existing verified accounts only. Public admin registration is blocked; explicit seeding remains available. |
| High | Previous buyer's receipts and points remained after switching accounts | Buyer records are scoped by authenticated database account. Shared demo data is discarded, active state clears on sign-out/switch, and stale responses cannot populate another account. |
| High | Verification provider rejection was reported as success; failed/expired delivery had no recovery | Provider error results return recoverable HTTP 503. Resend supports pending accounts, expiring hashed tokens, one-use verification, and a 60-second cooldown. |
| High | Server accepted malformed emails and short passwords | Registration validates field types, email format, username length, and passwords of at least 8 characters and at most 72 UTF-8 bytes. Admin seeding enforces its stronger minimum and the same byte limit. |
| High | Local startup omitted email settings and failed during SDK import | Explicit local file-email mode and provider settings are documented in `.env.example`. Configuration is validated before app import. The private outbox cannot be placed inside `Frontend`. |
| Medium | Verification links and redirects were hard-coded | Links use `BACKEND_URL`; successful verification redirects to `FRONTEND_URL`. Production requires HTTPS URLs and provider email mode. |
| Medium | Reservations, receipts, QR claims, points, and rewards depended on browser demo records | Authenticated APIs persist these records. Transactions protect inventory, completion, claims, and point spending; real QR encoding and decoding replace simulations. |
| Testing | Database-backed authenticated workflows remained unverified | Reproducible integration and browser commands start and stop their own disposable replica sets. All database test groups ran successfully. |

## Behavior verified

- An absent admin account cannot be created by attempting either fallback or
  configured admin credentials. Invalid account input and public admin creation
  are rejected through HTTP.
- Real registration writes a private local verification message. Its link
  verifies the account, redirects to the configured frontend, and enables login.
  Expired, replaced, and replayed links fail. Simulated provider rejection can be
  recovered with resend, and concurrent resends respect the cooldown.
- Reserving a kit holds inventory once without producing a receipt or points.
  Competing reservations cannot oversell. Repeated cancellation restores stock
  once. Unverified stores cannot accept new reservations.
- Only the owning store can complete pickup. Repeated completion creates one
  sale and one private buyer receipt, without another stock deduction. Receipt
  prices retain the reservation quote, including fractional currency amounts.
- QR images require the owning buyer's authentication. Forged tokens and another
  buyer's token are rejected. Simultaneous claims credit points once, and
  simultaneous reward redemptions cannot overdraw the wallet.
- The browser journey registered and verified two buyers and a seller, signed in
  through the login form, reserved a kit, completed pickup through the seller UI,
  displayed its real QR, uploaded that QR image into the scanner, claimed 400
  points, and redeemed a 350-point reward, leaving 50 points. Switching to the
  second buyer showed zero points and no receipts or redemptions, even after
  planting legacy demo data in browser storage.
- Buyer pages and the populated receipt/QR modal fit 1440, 390, and 320 px. No
  uncaught JavaScript errors occurred in the browser journey.
- Existing catalog ownership, seller sales, revenue history, events/RSVP
  concurrency, and moderated video upload/review/playback integration tests also
  passed against the disposable database.

## Environment-specific follow-up

- Set production `RESEND_API_KEY`, a verified `EMAIL_FROM`, HTTPS base URLs, and
  the actual database/JWT settings before deployment. Live recipient delivery
  and physical camera scanning were not exercised; the file-email and QR-image
  upload paths were exercised fully.
- Existing pending verification links from before the hashed-token change need
  **Resend verification email**. Existing unverified admin accounts also need
  verification; seeding preserves existing credentials.
- Purchases are settled during in-store pickup. There is no online payment
  provider. Manual walk-in seller sales have no buyer attribution and cannot
  generate buyer loyalty points.
- Rewards use the four server-configured catalog entries and persist pickup
  codes/status. Store fulfillment is handled directly; there is no seller
  pickup-code consumption screen. Seller offer availability remains local to
  each seller account.
- Password reset and exact storefront-map verification remain outside these
  eight prioritized fixes.

## Reproduce and inspect evidence

From `Backend`, run `npm run test:integration` and `npm run test:browser`. Both
commands own their disposable database; they do not use `MONGODB_URI`. See README
for binary caching, browser executable configuration, and local email settings.

Ignored local evidence includes `.tmp/workflow-integration/final-tests.log`,
`.tmp/workflow-integration/final-browser.log`, and the timestamped
`.tmp/browser-workflows/` results and mobile receipt screenshot. Earlier
`.tmp/system-retest/` artifacts contain the original failing probes; the current
tests supersede their fixture-only results.
