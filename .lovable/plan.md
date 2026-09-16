# Cinematic journey after Guest ID verification

A one-time cinematic plays **only after** the existing verification succeeds, then hands over to the existing app. No change to login, backend, session, or chat logic.

## What the user sees

1. VERIFIED ring + light sweep + particles, with "GUEST ID VERIFIED SUCCESSFULLY" (~1.5s), then it fades.
2. A medium-sized cargo truck appears below, rear cargo open.
3. The real username letters (never the password) drop one by one into the cargo and pile up.
4. Headlights on, wheels roll, camera tracks the truck forward (~5-6s) with parallax depth.
5. A medium parked airplane appears; the truck brakes beside it.
6. Letters float out of the cargo into the plane and vanish inside.
7. Natural forward takeoff, camera follows the climb (~5-6s).
8. Plane descends forward and settles slightly below screen centre, over the existing chat page.
9. A 2D character steps out, then plane + character dissolve with light and particles into the page.
10. The existing chat page is fully visible, nothing left behind.

Skip control is always present, and `prefers-reduced-motion` or any failure jumps straight to the app.

## How it is built

- `src/components/entry/JourneyCinematic.tsx` — one overlay component driving the phases with timers; pure CSS transforms/opacity, no 3D library, no physics engine. Truck/plane/character are layered 2.5D CSS shapes (gradients, shadows, pseudo-depth), so nothing to download and nothing to fail to load.
- `src/styles/journey-cinematic.css` — keyframes, camera parallax layers, responsive scale via `clamp()`/viewport units so the truck and plane stay medium-sized from 360px to 1920px with no overflow (`overflow: hidden` on the stage).
- `src/components/IdentityScreen.tsx` — after the **existing** `createIdentity` / `restoreIdentity` call returns `ok`, store only the username plus a one-shot flag in `sessionStorage`. No new auth, no password touched.
- `src/components/AppShell.tsx` — when the session becomes available and that one-shot flag exists, render the existing children with the overlay on top; the overlay removes itself and the flag when finished.
- Hard safety timeout ends the overlay if anything stalls, so the chat page is never blocked.

Everything else — Guest ID, Backup ID, chat, coins, shop, events, settings, NEW USTAD AI mode — is untouched.
