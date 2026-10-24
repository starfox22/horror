// Hinged doors that the player opens and shuts with E: the bathroom door (a downloaded door with frame merged in by
// tools/build-assets.mjs; its leaf, lever and latch have materials '<name>.bathdoor' and are left out of the baked walk
// grid). The leaf is a moving wall
// in the walk grid, stops when it swings into the player, and asks nearby lamps to re-render their static shadows while
// it moves. The swing is a damped spring (a push, a slight overshoot, settling), with latch, creak and closing thud.
import { Entity, Vec3 } from 'playcanvas';
import { segmentDistance } from './walkgrid.js';
import { refreshShadows } from './lighting.js';

// hinge: the hinge pins' axis (x, z); width: from the axis to the leaf's free edge; handleAt: the lever's middle, as a share
// of the width, and its height (tools/build-assets.mjs PROPS 'Prop_bath_door').
const BATHROOM = { tag: 'bathdoor', hinge: [9.1086, 0.390], width: 0.86, open: -92, handleAt: 0.89, handleY: 1.245, label: 'the bathroom door' };
const BODY = 0.22 + 0.05;     // player radius + half the leaf's thickness and a little air

export class Doors {
  constructor(app, apartment, interactions, grid, player, sounds) {
    this.app = app;
    this.grid = grid;
    this.player = player;
    this.sounds = sounds;
    this.doors = [BATHROOM].map(d => this.hang(apartment, interactions, d)).filter(Boolean);
    app.on('update', (dt) => this.update(dt));
  }

  hang(apartment, interactions, def) {
    const parts = apartment.findComponents('render').filter(r => r.meshInstances.some(mi => mi.material.name.endsWith(`.${def.tag}`)));
    if (!parts.length) return null;
    const [hx, hz] = def.hinge;
    const pivot = new Entity(`hinge ${def.tag}`);
    pivot.setPosition(hx, 0, hz);
    this.app.root.addChild(pivot);
    for (const r of parts) {
      const e = r.entity, wp = e.getPosition().clone(), wr = e.getRotation().clone();
      e.reparent(pivot);
      e.setPosition(wp); e.setRotation(wr);
    }
    const door = { ...def, pivot, angle: 0, vel: 0, target: 0, openRequested: false, moving: false, handle: new Vec3() };
    door.segment = () => {
      const a = door.angle * Math.PI / 180;
      // Closed, the leaf runs from the hinge along +z; a turn of `angle` about Y moves the free end to (sin a, cos a) * width.
      return [hx, hz, hx + Math.sin(a) * def.width, hz + Math.cos(a) * def.width];
    };
    this.grid.addBlocker(door.segment);
    this.placeHandle(door);
    interactions.add({ pos: door.handle, size: 0.42, label: () => `${door.openRequested ? 'Close' : 'Open'} ${def.label}`,
      use: () => this.toggle(door) });
    return door;
  }

  placeHandle(door) {
    const a = door.angle * Math.PI / 180, r = door.width * door.handleAt;
    door.handle.set(door.hinge[0] + Math.sin(a) * r, door.handleY, door.hinge[1] + Math.cos(a) * r);
  }

  toggle(door) {
    // Keep the requested direction when a player blocks the swing at a partial angle.
    // The next press then reverses it, even if it was closing when it got stuck.
    door.openRequested = !door.openRequested;
    door.target = door.openRequested ? door.open : 0;
    door.vel += (door.target ? door.open : -door.open) * 0.25;   // the push
    door.moving = true;
    door.blocked = false;
    this.sounds?.door?.(!!door.target, door.handle);
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    for (const d of this.doors) {
      if (!d.moving) continue;
      // Spring towards the target, slightly under-damped: the leaf swings past a touch and settles.
      const k = 26, c = 2 * Math.sqrt(k) * 0.82;
      const vel = d.vel + ((d.target - d.angle) * k - d.vel * c) * dt;
      let angle = d.angle + vel * dt;
      // Never through the frame: shutting ends at 0 with the latch; opening never goes past the stop.
      let shut = false;
      if (d.open < 0 ? angle > 0 : angle < 0) { angle = 0; shut = true; }
      if (d.open < 0 ? angle < d.open - 4 : angle > d.open + 4) angle = d.open + 4 * Math.sign(d.open);
      // Stop against the player instead of passing through them.
      const old = d.angle;
      d.angle = angle;
      const p = this.player.pos;
      if (segmentDistance(p.x, p.z, d.segment()) < BODY) {
        d.angle = old; d.vel = 0; d.target = old; d.moving = false;
        if (!d.blocked) this.sounds?.bump?.(d.handle);
        d.blocked = true;
      } else d.vel = vel;
      if (shut && d.target === 0) { d.vel = 0; d.moving = false; this.sounds?.doorShut?.(d.handle); }
      if (Math.abs(d.target - d.angle) < 0.05 && Math.abs(d.vel) < 0.5) { d.angle = d.target; d.vel = 0; d.moving = false; }
      d.pivot.setEulerAngles(0, d.angle, 0);
      this.placeHandle(d);
      refreshShadows(this.app, d.handle, d.width * 0.6 + 0.3);
    }
  }
}
