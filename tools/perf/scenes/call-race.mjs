// Matched 0.15 / 0.16 phone-call regression captures for scene-shots.mjs.
// Run both scenes, in order, under #shot: story time is advanced only here, so
// the first image holds B while ringing; the second holds it after A's old hangup.
// All displayed call outcomes come from Phone methods and Story's real timers.
export default [
  { name: 'phone-replaced-question', wait: 3, setup: async s => {
    const st = s.story, ph = s.phone, hud = s.hud;
    hud.closeDoc();
    // Isolate from the preceding power/HUD scenes. The queues here are fixture
    // preparation, not the power-load regression being compared elsewhere.
    st.flags.clear(); st.timers.length = 0; st.time = 0; st.act = 0;
    st.dying = false; st.sighting = null; st.unlock = null; st.cutting = false; st.cutWaiting = null;
    s.power.transitions.length = 0; s.power.surges.length = 0;
    s.power.load({ main: true, rcd: true,
      breakers: Object.fromEntries(Object.keys(s.power.breakers).map(k => [k, true])), faults: [] });
    s.power.mainBroken = false;
    const clearHud = () => {
      for (const channel of ['prompt', 'toast', 'voice', 'sound']) {
        clearTimeout(hud[`${channel}Timer`]);
        hud[`${channel}El`].hidden = true;
        hud[`${channel}El`].classList.remove('out');
      }
    };
    clearHud();
    // In 0.15 an already-running fade has an untracked 900 ms callback. Drain
    // it before the independent phone scene rather than let it affect this view.
    await new Promise(resolve => setTimeout(resolve, 1000));
    s.intruder.show(false);
    if (s.flashlight.on) s.flashlight.toggle();
    s.view(8.6, 1.79, 3.5, 90, -6);
    s.player.pos.set(8.6, 0, 3.5);
    ph.seccam?.stopLive?.(); ph.video.enabled = false;
    ph.has = true; ph.onCharger = false; ph.charger?.(false); ph.silenced = true;
    ph.call = null; ph.boot({ now: true }); ph.charge = 23;
    ph.raised = true; ph.raiseK = 1; ph.lit = 0;
    s.callRaceAdvance = seconds => {
      for (let i = 0; i < Math.ceil(seconds * 20); i++) st.update(0.05);
    };
    s.callRaceEvidence = [];
    s.recordCallRace = label => s.callRaceEvidence.push({
      label, time: st.time, isNewCall: ph.call === s.callRaceB,
      line: ph.call?.line ?? null, connected: !!ph.call?.connected, screen: ph.app_,
    });
    ph.dial(); s.callRaceAdvance(3.3);
    ph.answer({ id: 'unsure', text: 'A glass broke. I think someone’s here.' });
    s.callRaceAdvance(1); ph.hangUp(true); ph.dial();
    s.callRaceB = ph.call;
    s.callRaceAdvance(1.6);
    s.recordCallRace('old question due, new call still ringing');
    // These comparison images inspect the phone's actual screen. Hide transient
    // HUD captions: their wall clock intentionally does not follow staged story time.
    clearHud(); s.clearCallRaceHud = clearHud;
    ph.dirty = true; ph.update(0);
  } },
  { name: 'phone-replaced-hangup', wait: 3, setup: s => {
    s.callRaceAdvance(6.6);
    s.recordCallRace('old automatic hangup due');
    s.clearCallRaceHud();
    s.phone.dirty = true; s.phone.update(0);
  } },
];
