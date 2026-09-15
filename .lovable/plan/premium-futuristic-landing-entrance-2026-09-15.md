# Premium futuristic landing entrance

## Goal
Add a mobile-first landing page as the front door to USTAD AI while preserving the existing app, identity, data, and all feature behavior.

## What will change
- Keep the supplied Yusuf Ali image visually unchanged and serve it as the priority-loaded hero poster.
- Move the current Chat/Home screen intact to `/app`; internal “Chat” and USTAD AI home links will point there.
- Make `/` the new landing page with:
  - dominant mobile hero poster with a short fade/lift/light-sweep entrance
  - an About USTAD AI section with concise professional copy
  - an abstract interactive AI core with orbit rings, neural nodes, touch drag, inertia, tap pulse, and scroll-linked activation
  - three compact feature cards
  - a final **OPEN USTAD AI →** action that opens `/app`
- Keep the existing identity gate inside the existing application, so the landing page never creates or changes Guest IDs or login state.

## Technical details
- Use lightweight CSS and a small Canvas 2D renderer rather than a 3D model or heavy dependency; the visual will still provide depth, rotation, orbit, particles, and touch interaction.
- Allow vertical page scrolling while recognizing deliberate horizontal dragging only inside the AI visual.
- Pause rendering off-screen, reduce detail for slower devices, provide a CSS fallback when Canvas is unavailable, and respect reduced-motion settings.
- Add landing-specific semantic color tokens and styles without changing existing app theme behavior.
- Add unique page metadata for `/` and `/app`.

## Verification
- Check 360, 375, 390, 412, and 430px mobile widths for cropping, text overflow, and horizontal scrolling.
- Verify the uploaded image remains fully visible and undistorted.
- Verify touch drag, tap pulse, natural page scrolling, scroll progression, off-screen pause, and reduced-motion behavior.
- Verify **OPEN USTAD AI →** reaches the unchanged existing app and its current identity/session flow.
- Run focused route/type tests and browser checks with no console or page errors.
