# Hand-off: read this first

A browser horror game in the spirit of Konami's P.T. (first person, one quiet house, photoreal, AAA look).
The owner works with AI agents; any agent picking this up continues from the state below and keeps this file
current.

## Owner's requirements (from the first brief)
- AAA-looking graphics, playable in a desktop browser.
- Download existing free assets (Sketchfab, Poly Haven or similar) instead of making them, to save tokens.
- Setting: a house, a museum or a modern apartment. The player is alone.
- First milestone: a walkable first-person environment where you can walk around and look at things.
  Nothing else (no enemies, story, puzzles) until the owner asks.
- Show screenshots and links of proposals before development; wait for the owner's confirmation.
- Keep everything documented so another AI can continue.

## State
- 2026-10-22: round 2 added to docs/PROPOSAL.md: seven no-login GitHub archviz rooms, examples page
  https://claude.ai/artifact/6PVjhA37A16UxRMxhQhnPz; owner prioritises a modern detailed apartment.
- 2026-10-22: proposal written (docs/PROPOSAL.md), shared with the owner as a claude.ai page (https://claude.ai/artifact/3NwzpfHYfCAMCW5Mvb8uz2). Waiting for the
  owner to pick the engine and one environment. No code yet.

## Next steps once the owner chooses
1. Scaffold: `npm create vite@latest` (vanilla JS) + `npm i playcanvas`; first-person controller (pointer
   lock, WASD, head bob off by default), collision from a simplified proxy mesh.
2. Import the chosen .glb, compress (gltf-transform: meshopt + KTX2), credit it in docs/CREDITS.md.
3. Lighting and post: CameraFrame (TAA, SSAO, bloom, grading, vignette), dim practical lights.
4. Document how to run, build and deploy in README.md.
