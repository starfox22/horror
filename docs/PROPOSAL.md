# Proposal: engine and environment (stage 0, awaiting the owner's choice)

Status (2026-10-22): **no development has started.** The owner asked for an engine recommendation and a
shortlist of free environment assets, with links and screenshots, before choosing. Nothing is built until the
owner confirms one engine and one environment from this list.

Goal of stage 1 (after the choice): a first-person, walkable environment in the browser, P.T.-like mood
(quiet domestic interior, dim practical lights, photoreal surfaces), alone, no enemies or story yet.

## Engine recommendation: PlayCanvas Engine (code-first, MIT)

Use the open-source engine from npm (`playcanvas`), built with Vite, no hosted editor required.

Why:
- Runs on WebGPU with a WebGL2 fallback, so it reaches every current desktop browser.
- `CameraFrame` gives the AAA post stack in one object: HDR, TAA, SSAO, bloom, depth of field, vignette,
  colour grading and LUTs, chromatic fringing, sharpening
  (https://developer.playcanvas.com/user-manual/graphics/posteffects/cameraframe).
- Clustered lighting with shadow-casting omni/spot lights and area lights; a built-in runtime lightmapper for
  baked bounce light; glTF 2.0 with Draco/meshopt and KTX2 (Basis) compressed textures for fast loading.
- First-class Gaussian splat rendering (engine 2.x, shadows from splats since 2.15): a path to photoreal
  scanned rooms later if wanted.
- It is a library, so Claude can build, run and screenshot it headless in the cloud container (npm is reachable
  there; the PlayCanvas hosted editor and Unity/Unreal editors are not usable from it).

Alternatives considered:
| Engine | Verdict |
|---|---|
| Three.js (WebGPURenderer + TSL) | Strong second choice; biggest ecosystem, but SSAO/TAA/grading/lightmaps are assembled from add-ons. |
| Babylon.js 8 | Also capable (IBL shadows, area lights, render graph); heavier API, smaller pool of horror/FPS examples. |
| Unity 6 Web (URP) | Best editor tooling, but HDRP is not available on the web, builds are 20-60 MB and slow to start, and the editor cannot run in this cloud workflow. |
| Godot 4 web export | Web export only uses the Compatibility renderer (no SDFGI/SSR/volumetrics): not AAA. |
| Unreal Engine 5 | No in-browser export; Pixel Streaming streams video from a GPU server (not "runs in the browser", costs money per user). |

## Environment shortlist (all listed as free downloads; licence per listing, verify on download)

A. Photogrammetry scans (photoreal on day one, lighting is baked into the texture so it cannot be relit)
1. The Hallwyl Museum 1st Floor Combined, Thomas Flynn (owner's suggestion). CC BY 4.0, ~498k tris, ten real
   1890s Stockholm state rooms, made for WebVR. Also mirrored as .glb (25 MB) on Zenodo record 21376041.
   https://sketchfab.com/3d-models/the-hallwyl-museum-1st-floor-combined-f74eefe9f1cd4a2795a689451e723ee9
   Higher-detail single rooms (~1M tris each, CC BY) are in the museum's collection:
   https://sketchfab.com/TheHallwylMuseum/collections/the-hallwyl-museum-1st-floor-state-rooms-dc238732ee4c4e0ca9b1c46e762559fe
2. Full Apartment, Volare Drones. CC BY, ~1M tris, RealityCapture scan of a real apartment.
   https://sketchfab.com/3d-models/full-apartment-382c13d2c16542dd90678536e16b099a
3. Abandoned house interior, 3Dog. CC BY, ~619k tris, photogrammetry of a real derelict house.
   https://sketchfab.com/3d-models/abandoned-house-interior-c2130293962244d0b8e325919b4cf99d

B. Relightable modelled interiors (PBR materials, lit in-engine: flicker, darkness, red light all possible)
4. Realistic House (With Interior), Blender Studio (@Blend_GUY). CC BY, ~77.5k tris, unfurnished shell with
   rooms, doors and floors. https://sketchfab.com/3d-models/realistic-house-with-interior-c57c2019e5c84e1a8cd0c37c5b87b7ec
5. VR apartment loft interior (baked), ChristyHsu. CC BY, real-world scale, stairs, baked light.
   https://sketchfab.com/3d-models/vr-apartment-loft-interior-baked-54bc929a26094b6cb36f977903fbcd97
6. Modern apartment interior, Katydid. CC BY, ~60k tris, game-ready.
   https://sketchfab.com/3d-models/modern-apartment-interior-400c9069181a4342a7142433dfa3466e
7. Old Victorian House Hallway Diorama, Braeden Wylam. CC BY, hallway with period furniture.
   https://sketchfab.com/3d-models/old-victorian-house-hallway-diorama-3345600555b74719a68a0477451a7303

8. Modern Apartment, Visthétique (suggested by the owner, 2026-10-22). CC BY, ~3M tris, published
   2025-11-27, furnished: open-plan living/kitchen/dining, one bedroom, one bathroom, work space. Strong candidate if
   the lighting is not baked; heavy, so decimate the dense furniture and compress textures (KTX2) for the web.
   https://sketchfab.com/3d-models/modern-apartment-1fbb649cd6624f2bb7b7d6e30c6533a5

Dressing for B (any choice): Poly Haven CC0 props, textures and HDRIs (https://polyhaven.com/models), which
are scan-quality and need no attribution.

Claude's pick: **4 (Realistic House) dressed with Poly Haven props**, if the owner wants P.T.'s lighting
tricks; **1 (Hallwyl)** if photoreal-from-day-one matters more than relighting.

## Blockers found in the cloud container (owner action)

- The environment's network policy only reaches GitHub and package registries (npm, PyPI). These hosts were
  denied: sketchfab.com, api.sketchfab.com, media.sketchfab.com, polyhaven.com, api.polyhaven.com,
  zenodo.org, huggingface.co. Screenshots and downloads need them added under Allowed domains
  (https://code.claude.com/docs/en/cloud-environments#network-access); add dl.polyhaven.org and
  cdn.polyhaven.com too.
- Sketchfab's download API needs a personal API token (Sketchfab account, Settings > Password & API). Put it in
  the environment's secrets as `SKETCHFAB_TOKEN`, or download the .glb yourself and commit it under `assets/`.
- Triangle counts and licences above come from search-engine snapshots of the listings, not from the pages
  themselves (blocked); check them on download.

## Round 2 (2026-10-22): assets Claude can download without a login, apartment first

The owner asked for assets downloadable without logging in, prioritising a modern detailed apartment.
Examples page with screenshots: https://claude.ai/artifact/6PVjhA37A16UxRMxhQhnPz

Source: https://github.com/ErfanMo77/gltf-research-scenes (glTF 2.0 conversions of Blend Swap archviz scenes
from Benedikt Bitterli's rendering resources). The .bin/.png files are Git LFS: the cloud's anonymous git lane
does not serve LFS, but `https://media.githubusercontent.com/media/ErfanMo77/gltf-research-scenes/main/<path>`
does (no login). Each scene's textures are embedded in its `gltf/<name>.bin`; use `gltf/<name>_extended.gltf`.

| Scene folder | Original | Author | Licence | Notes |
|---|---|---|---|---|
| living-room-2 | The White Room | Jay-Artist | CC BY 3.0 | 601k tris, closed room ~5.7 x 7.8 m, 34 MB |
| kitchen | Country Kitchen | Jay-Artist | CC BY 3.0 | ~1.4M tris, closed room ~6.9 x 8.7 m, 44 MB |
| bathroom | Contemporary Bathroom | Mareck | CC0 | ~97 MB, not previewed live yet |
| breakfast-room | The Breakfast Room | Wig42 | CC BY 3.0 | dark dining room, 24 MB |
| living-room | The Grey & White Room | Wig42 | CC BY 3.0 | 286k tris, closed room ~5.6 x 4.2 m, 14 MB |
| bathroom2 | Salle de bain | nacimus | CC BY 3.0 | 60 MB |
| modern-hall | Modern hall | NewSee2l035 | CC BY 3.0 | partial set, only the camera side is built |

Findings from a headless WebGL check (three.js, raw import, one generic environment light):
- The rooms are closed shells at real scale, but furnished only in the half the original camera sees.
- Raw real-time looks flat; the target look needs baked lighting. Blender (`bpy` 5.2.3) is on PyPI, which the cloud
  reaches, so baking can be done in-session.
- Rejected: Kroken and Watercolor (mmp/pbrt-v4-scenes, CC BY-ND forbids modification), Villa (no licence).

Proposed apartment: White Room (living) + Country Kitchen + Breakfast Room (dining) + Contemporary Bathroom, joined
by a hand-built L-shaped hallway; empty halves dressed with props from the other rooms and Poly Haven (CC0).
Other no-login sources that need their domains allowed: Poly Haven, Objaverse on Hugging Face (mirror of older
Sketchfab CC models), Zenodo. Sketchfab itself always needs an account to download.
