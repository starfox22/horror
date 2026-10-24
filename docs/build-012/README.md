# Build 0.12 captures

Headless Chromium with SwiftShader (software WebGL 2), High preset; left = build 0.11 (`main` at 73f66df), right =
build 0.12. Software rendering is dark and noisy compared with a GPU; compare the two sides, not absolute brightness.

- `leak-bedroom-lights-only.jpg`: only the bedroom's lights on (developer overrides), everything else off. Rows: corridor
  looking east, corridor looking west, bathroom, wardrobe, shoe closet. 0.11 lit the bathroom through its wall (row 3)
  and the corridor ceiling by the bedroom door (row 2); 0.12 keeps the light in the bedroom.
- `startup-closet-and-corridor.jpg`: the start-up lighting: shoe closet, bedroom towards the wardrobe, corridor.
- `drinking.jpg`: the drinking action in 0.12 at 0.45-7.9 s (kitchen lights on for visibility).
- `events-menu.png`: developer menu with the Events list.
