#!/bin/sh
# Rebuild the drinking arm from the downloaded Rocketbox files (see README.md). Run from anywhere:
#   sh /home/user/horror/work/arm/scripts/make_all.sh [--no-previews]
set -e
ARM=$(cd "$(dirname "$0")/.." && pwd)
cd "$ARM"
python3 -I scripts/build_arm.py downloads/Male_Adult_13 build          # GLB + textures + build-facts.json
python3 -I scripts/fit_poses.py build                                  # arm-data.json (relaxed + grip), ~80 s
cp build/drinking-arm.glb build/arm-data.json "$ARM/"
if [ -d downloads/npm-gltf-validator/node_modules/gltf-validator ]; then node scripts/validate_glb.mjs drinking-arm.glb; fi
if [ "$1" != "--no-previews" ]; then
  rm -rf preview/final
  node scripts/render_previews.mjs viewer/views-final.json preview/final build/drinking-arm.glb build/arm-data.json
  python3 -I scripts/grid.py preview/overview.png 3 preview/final/rest_dorsal.png preview/final/rest_palm.png preview/final/rest_side.png \
    preview/final/grip_near_side.png preview/final/grip_far_side.png preview/final/grip_back_of_hand.png \
    preview/final/closeup_nails.png preview/final/closeup_back.png preview/final/closeup_palm.png
fi
