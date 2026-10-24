"""Local functional check using the cloud image's Playwright and Chromium."""
import json
import sys
import os
from urllib.parse import urlsplit
from pathlib import Path
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5173/'
mode = sys.argv[2] if len(sys.argv) > 2 else 'webgl'
output = Path(sys.argv[3] if len(sys.argv) > 3 else '/tmp/horror-browser-check')
output.mkdir(parents=True, exist_ok=True)
errors = []
failed_requests = []
console_errors = []
http_failures = {}
with sync_playwright() as p:
    flags = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    if mode == 'webgpu':
        flags += ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader']
    launch_options = {'executable_path': os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), 'headless': True, 'args': flags}
    target = urlsplit(url)
    session_proxy = os.environ.get('HTTPS_PROXY' if target.scheme == 'https' else 'HTTP_PROXY')
    if target.hostname not in ('localhost', '127.0.0.1', '::1') and session_proxy:
        endpoint = urlsplit(session_proxy)
        proxy = {'server': f'{endpoint.scheme}://{endpoint.hostname}:{endpoint.port or (443 if endpoint.scheme == "https" else 80)}'}
        if endpoint.username:
            proxy['username'] = endpoint.username
        if endpoint.password:
            proxy['password'] = endpoint.password
        launch_options['proxy'] = proxy
    browser = p.chromium.launch(**launch_options)
    page = browser.new_page(viewport={'width': 480, 'height': 270})
    page.add_init_script('Math.random=(()=>{let x=42;return()=>((x=Math.imul(x,1664525)+1013904223|0)>>>0)/4294967296;})()')
    page.set_default_timeout(120000)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('requestfailed', lambda request: failed_requests.append({'url': request.url, 'failure': request.failure}))
    page.on('response', lambda response: http_failures.update({response.url: response.status}) if response.status >= 400 else None)
    # The game intentionally probes for an absent optional artifact manifest.
    def collect_console(message):
        location = message.location.get('url', '')
        if message.type == 'error' and not location.endswith(('/assets/apartment/apartment.json', '/favicon.ico')):
            console_errors.append({'text': message.text, 'location': location})
    page.on('console', collect_console)
    response = page.goto(url + ('#webgl&q=1' if mode == 'webgl' else '#q=1'), wait_until='domcontentloaded')
    assert response and response.status == 200, 'HTML request failed'
    page.wait_for_function('window.__state?.ready || window.__state?.error', timeout=600000)
    state = page.evaluate('window.__state')
    assert state == {'ready': True, 'error': None}, {'state': state, 'errors': errors, 'requests': failed_requests, 'console': console_errors}
    print(f'{mode}: apartment initialized', flush=True)
    assert page.locator('#enter').is_visible(), 'Entry button unavailable'
    assert page.locator('#loading').evaluate('(element) => element.hidden'), 'Loading state not cleared'
    assert not page.locator('#loading').is_visible(), 'Loading indicator still visible'
    result = page.evaluate('''() => {
      const s = window.__app;
      return {state: window.__state, device: s.app.graphicsDevice.deviceType,
        renderComponents: s.app.root.findComponents('render').length,
        rooms: s.switches.rooms.length, lamps: s.devices.lamps.length,
        frame: s.app.frame, floor: s.player.floor,
        probeLevels: s.probes.levels};
    }''')
    assert result['renderComponents'] > 50, result
    assert result['rooms'] == 9 and result['lamps'] >= 4, result
    assert page.locator('#stats').is_visible(), 'FPS counter must be on by default'
    assert page.locator('#stats').count() == 1, 'Duplicate FPS counters'
    assert page.evaluate('[window.__app.flashlight.beam.light.shadowUpdateMode, window.__app.flashlight.bounce.light.shadowUpdateMode]') == [2, 2], 'Both moving flashlight shadow maps must survive startup probe capture'
    fixtures = page.evaluate('''() => {
      const s = window.__app, rooms = Object.fromEntries(s.switches.rooms.map(room => [room.id, room]));
      const b = s.flashlight.restBounds;
      return {defaults: Object.fromEntries(s.switches.rooms.map(room => [room.id, room.on])),
        lamps: Object.fromEntries(s.devices.lamps.map(lamp => [lamp.name, {on: lamp.on, level: lamp.level,
          enabled: lamp.lights.map(entity => entity.light.enabled), emission: lamp.mat?.emissiveIntensity ?? 0}])),
        activeSources: s.app.root.findComponents('light').filter(light => light.entity.enabled && light.enabled && light.intensity > 0.001 && light.entity.name !== 'moon').map(light => light.entity.name).sort(),
        screens: {laptopPower: s.devices.laptop.power, computerOn: s.devices.computer.on,
          computerLevel: s.devices.computer.level,
          emissions: [...s.devices.laptop.glows, ...s.devices.computer.glows, ...s.devices.coffee.glows].map(glow => glow.mat.emissiveIntensity)},
        mirrorIntensity: rooms.mirror.base[0], hoodIntensity: rooms.hood.base[0],
        mounts: s.switches.rooms.filter(room => room.plate).map(room => ({id: room.id, embed: room.mount.backEmbed,
          scale: room.plate.getLocalScale().toArray()})), removedTriangles: s.switches.removedSwitchTriangles,
        flashlight: {parts: s.flashlight.modelRenders.length, minimumY: b.getMin().y,
          maximumY: b.getMax().y, width: b.halfExtents.x * 2},
        fridge: {angle:s.fridge.angle, enabled:s.fridge.light.light.enabled, glow:s.fridge.glow.emissiveIntensity,
          triangles:s.fridge.movingTriangles, cap:s.fridge.removedCapTriangles,
          water:s.fridge.waterLevel, jarTop:s.fridge.jar.getPosition().y+s.fridge.jarHeight}};
    }''')
    assert fixtures['defaults'] == {'living': False, 'dining': False, 'kitchen': False, 'office': False,
        'hall': False, 'bathroom': False, 'bedroom': False, 'mirror': True, 'hood': True}, fixtures
    expected_lamps = {'Reading lamp (left)': True, 'Reading lamp (right)': True, 'Arc lamp': True,
        'Desk lamp': False, 'Closet light': False}
    assert {name: lamp['on'] for name, lamp in fixtures['lamps'].items()} == expected_lamps, fixtures
    for name, on in expected_lamps.items():
        lamp = fixtures['lamps'][name]
        assert lamp['level'] == int(on) and all(enabled == on for enabled in lamp['enabled']), fixtures
        if not on:
            assert lamp['emission'] == 0, fixtures
    # Build 0.12: the laptop and the office computer start on (their screen glows are shadowed spots).
    assert fixtures['activeSources'] == sorted(['arc lamp', 'cooker hood', 'bathroom mirror', 'iMac glow', 'laptop glow',
        'bedside lamp left', 'bedside spill left', 'bedside lamp right', 'bedside spill right']), fixtures
    assert fixtures['screens']['laptopPower'] == 1 and fixtures['screens']['computerOn'] and fixtures['screens']['computerLevel'] == 1, fixtures
    assert all(emission > 0 for emission in fixtures['screens']['emissions'][:-1]), fixtures
    assert 0 < fixtures['mirrorIntensity'] < 0.2 and 0.4 <= fixtures['hoodIntensity'] <= 0.5, fixtures
    assert len(fixtures['mounts']) == 8 and all(mount['scale'] == [1, 1, 1] and 0 < mount['embed'] < 0.001 for mount in fixtures['mounts']), fixtures
    assert 150 <= fixtures['removedTriangles'] <= 180, fixtures
    torch = fixtures['flashlight']
    assert torch['parts'] >= 2 and 1.84 < torch['minimumY'] < 1.843 and torch['maximumY'] < 1.92 and torch['width'] > 0.25, fixtures
    fridge = fixtures['fridge']
    assert fridge['angle'] == 0 and not fridge['enabled'] and fridge['glow'] == 0 and fridge['triangles'] > 1000 and fridge['cap'] > 0 and fridge['water'] < fridge['jarTop'] - 0.05, fixtures
    result['fixtureDefaultsAndPlacement'] = 'passed'
    page.locator('#graphics-open').click()
    page.wait_for_function('document.getElementById("graphics-dialog").open')
    assert page.locator('[data-option="showFps"]').is_checked()
    page.locator('[data-option="bloom"]').uncheck()
    page.wait_for_function('window.__app.frame.bloom.intensity === 0')
    page.locator('[data-option="bloom"]').check()
    page.wait_for_function('window.__app.frame.bloom.intensity > 0')
    page.locator('#graphics-preset').select_option('low')
    assert page.locator('#graphics-fps-limit').input_value() == '-1'
    page.locator('#graphics-fps-limit').select_option('30')
    page.wait_for_function('window.__app.frameLimiter.limit === 30 && window.__app.graphics.settings.fpsLimit === 30')
    assert page.evaluate('window.__app.graphics.settings.preset') == 'low'
    page.locator('#graphics-fps-limit').select_option('60')
    page.wait_for_function('window.__app.frameLimiter.limit === 60')
    page.locator('#graphics-done').click()
    page.wait_for_function('!document.getElementById("graphics-dialog").open')
    result['graphicsMenuAndLiveControls'] = 'passed'
    assert result['frame'] > 0 and result['floor'] > 0, result
    assert len(result['probeLevels']) == 8 and all(isinstance(v, (int, float)) and 0 <= v < float('inf') for v in result['probeLevels']), result
    assert any(v > 0 for v in result['probeLevels']), result
    if mode == 'webgpu':
        assert result['device'] == 'webgpu', result
    else:
        assert result['device'] == 'webgl2', result
    page.locator('#enter').click()
    page.wait_for_function('document.pointerLockElement === document.getElementById("app")')
    # A fresh game begins in bed; inspect the real opening before it hands off
    # to the normal controller. Screenshot URLs bypass this sequence separately.
    if page.evaluate('!!window.__app.wake'):
        page.wait_for_function('window.__app.wake.started')
        opening = page.evaluate('''() => {
          const s=window.__app;
          return {text: s.wake.dialogue.textContent, active: s.player.active,
            running:s.wake.running, pose:s.camera.getPosition().toArray()};
        }''')
        assert opening['text'] == 'I just had a nightmare, I will go get some water at the kitchen', opening
        page.wait_for_function('window.__app.wake.completed && window.__app.player.active', timeout=120000)
        landing = page.evaluate('''() => {const p=window.__app.player;return {
          x:p.pos.x,z:p.pos.z,clear:p.grid.fits(p.pos.x,p.pos.z,0.22,p.floor),
          overlayHidden:window.__app.wake.overlay.hidden};}''')
        assert abs(landing['x']-12.85)<0.01 and abs(landing['z']-1.8)<0.01 and landing['clear'] and landing['overlayHidden'], landing
        result['wakeOpening'] = {'dialogue':opening['text'], 'landing':landing}
        print(f'{mode}: waking sequence and bedside handoff passed', flush=True)
    # Wait for the visible entry transition before exercising keyboard controls.
    page.wait_for_function('window.__app.player.active && Number(getComputedStyle(document.getElementById("intro")).opacity) < 0.01')
    print(f'{mode}: pointer lock entered', flush=True)
    def type_developer(enabled):
        # Pace native key events by application receipt on software renderers.
        for index, letter in enumerate('developer'):
            page.keyboard.press(letter)
            if index < 8:
                page.wait_for_function('(prefix) => window.__app.devMenu.typed.endsWith(prefix)', arg='developer'[:index + 1], polling=100)
            else:
                page.wait_for_function('(enabled) => window.__app.devMenu.mode === enabled', arg=enabled, polling=100)
    type_developer(True)
    try:
        page.wait_for_function('window.__app.devMenu.mode === true && document.pointerLockElement === null')
    except Exception:
        print(page.evaluate('({state:window.__state,mode:window.__app.devMenu.mode,typed:window.__app.devMenu.typed,locked:!!document.pointerLockElement})'), flush=True)
        raise
    page.locator('#dev').wait_for(state='visible')
    assert page.locator('#dev').is_visible(), 'Developer panel did not open'
    assert page.evaluate('document.pointerLockElement === null'), 'Developer mode must release mouse capture'
    lighting = page.evaluate('''async () => {
      const s = window.__app;
      s.rain.flash.next = 1e9; s.rain.flash.seq = [];
      const before = [...s.probes.levels];
      s.devMenu.entries.forEach(entry => entry.force = false);
      s.devMenu.changed(); clearTimeout(s.devMenu.timer); s.devMenu.update(0);
      await s.devMenu.sys.recapture();
      const dark = [...s.probes.levels];
      const forcedEmittersOff = s.devMenu.entries.every(entry =>
        entry.lights.every(({e}) => !e.light.enabled && e.light.intensity === 0) &&
        entry.glows.every(({mat}) => mat.emissiveIntensity === 0));
      // Separate the deliberately faint exterior sky from accidental indoor emission.
      const sky = s.app.scene.skyboxIntensity;
      let noSky;
      try {
        s.app.scene.skyboxIntensity = 0;
        await s.devMenu.sys.recapture();
        noSky = [...s.probes.levels];
      } finally { s.app.scene.skyboxIntensity = sky; }
      s.devMenu.reset(); clearTimeout(s.devMenu.timer); s.devMenu.update(0);
      await s.devMenu.sys.recapture();
      return {before, dark, noSky, forcedEmittersOff, restored: [...s.probes.levels]};
    }''')
    assert lighting['forcedEmittersOff'], lighting
    assert max(lighting['noSky']) < 0.00001, lighting
    # The exterior contributes about 1e-4; allow the measured WebGL/WebGPU
    # filtering difference, while still rejecting the former 2.6e-4 screen leak.
    assert max(lighting['dark']) < 0.00011, lighting
    drift = max(abs(a-b) for a,b in zip(lighting['before'], lighting['restored']))
    assert drift < 0.003, lighting
    assert page.evaluate('[window.__app.flashlight.beam.light.shadowUpdateMode, window.__app.flashlight.bounce.light.shadowUpdateMode]') == [2, 2], 'Probe refresh must preserve realtime flashlight shadows'
    assert page.evaluate('!window.__app.fridge.light.light.enabled && window.__app.fridge.glow.emissiveIntensity === 0'), 'Closed refrigerator must stay dark after developer reset'
    result['lighting'] = {'allOffMax': max(lighting['dark']), 'allOffWithoutSkyMax': max(lighting['noSky']), 'restoreMaxDifference': drift}
    print(f'{mode}: light-off and restore invariants passed', flush=True)
    page.locator('#dev-give').click()
    page.wait_for_function('window.__app.flashlight.held === true')
    assert page.evaluate('window.__app.flashlight.held'), 'Flashlight pickup failed'
    # Drive the real controller for one simulated second; software frames are slow.
    movement = page.evaluate('''() => {
      const {player} = window.__app;
      const before = player.pos.clone();
      player.active = true; player.keys.add('KeyW');
      for (let i = 0; i < 60; i++) player.update(1 / 60);
      player.keys.delete('KeyW'); player.active = false;
      return {distance: player.pos.distance(before), x: player.pos.x, z: player.pos.z};
    }''')
    assert movement['distance'] > 0.5, movement
    result['movement'] = movement
    type_developer(False)
    page.wait_for_function('window.__app.devMenu.mode === false')
    page.locator('#enter').click()
    page.wait_for_function('document.pointerLockElement === document.getElementById("app")')
    page.wait_for_function('window.__app.player.active && Number(getComputedStyle(document.getElementById("intro")).opacity) < 0.01')
    page.evaluate('''() => {
      const s = window.__app, p = s.player;
      p.pos.set(-5.455, 0, 0.1); p.floor = p.grid.floorUnder(p.pos.x,p.pos.z,0.22);
      p.eyeY = p.floor + 1.62; p.yaw = 0;
      p.pitch = -Math.atan2(p.eyeY - 1.08, 0.96) * 180 / Math.PI;
      p.apply(0); s.interactions.enabled = true; s.interactions.update();
      // Freeze only the accepted brew's clock before its first render. A software
      // shader compile can outlast the entire audio sequence on the first use.
      window.addEventListener('keydown', event => {
        if (event.code !== 'KeyE') return;
        const c = s.devices.coffee;
        window.__coffeeNativeStart = c.busy;
        if (c.busy) { c.playback?.stop(); c.cycle.clock = () => 0; }
      }, { once: true });
    }''')
    page.wait_for_function('window.__app.interactions.focus?.label().includes("coffee")')
    page.keyboard.press('e')
    page.wait_for_function('window.__coffeeNativeStart === true && window.__app.devices.coffee.busy')
    coffee = page.evaluate('''() => {
      const d = window.__app.devices, c = d.coffee;
      c.playback?.stop(); c.cycle.time = 8; c.cycle.clock = () => 8; d.updateCoffee(0);
      return {phase: c.phase, streams: c.effects.streams.filter(e => e.enabled).length,
        cups: c.effects.surfaces.filter(e => e.enabled).length, fill: c.cycle.state.fill};
    }''')
    assert coffee['phase'] == 'Pouring coffee' and coffee['streams'] == 2 and coffee['cups'] == 2 and 0 < coffee['fill'] < 1, coffee
    page.wait_for_timeout(1000)
    completion = page.evaluate('''() => {
      const d = window.__app.devices, c = d.coffee;
      c.cycle.time = 16; c.cycle.clock = () => 16; d.updateCoffee(0);
      return {busy: c.busy, phase: c.phase, fill: c.cycle.state.fill,
        streams: c.effects.streams.filter(e => e.enabled).length};
    }''')
    assert completion == {'busy': False, 'phase': 'Ready', 'fill': 1, 'streams': 0}, completion
    page.keyboard.press('e')
    page.wait_for_function('window.__app.devices.coffee.busy && window.__app.devices.coffee.cycle.state.fill === 0')
    page.evaluate('window.__app.devices.coffee.playback?.stop()')
    result['coffeeNativeInteractionPourAndReplay'] = 'passed'
    # Verify the new refrigerator in the deployed game using the same native
    # action path, then capture its final jar placement at the comparison view.
    page.set_viewport_size({'width': 720, 'height': 480})
    page.evaluate('''() => {
      const s=window.__app,p=s.player,c=s.devices.coffee;
      c.playback?.stop();c.cycle.time=16;c.cycle.clock=()=>16;s.devices.updateCoffee(0);
      if(s.flashlight.on)s.flashlight.toggle();s.flashlight.power=0;
      s.flashlight.beam.light.enabled=s.flashlight.bounce.light.enabled=false;
      s.graphics.setPreset('medium');s.eyes.fixed=1;s.eyes.value=1;s.eyes.update(0);
      s.rain.flash.next=1e9;s.rain.flash.seq=[];p.bobOn=false;
      document.getElementById('grain').style.animation='none';
      p.pos.set(1.12,0,.68);p.floor=p.grid.floorUnder(p.pos.x,p.pos.z,.22);p.eyeY=p.floor+1.62;p.vel.set(0,0,0);
      const target=s.fridge.handle,d=target.clone().sub(s.camera.getPosition());
      // Compute from the new player eye, before applying its final rotation.
      d.set(target.x-p.pos.x,target.y-p.eyeY,target.z-p.pos.z);
      p.yaw=Math.atan2(-d.x,-d.z)*180/Math.PI;p.pitch=Math.atan2(d.y,Math.hypot(d.x,d.z))*180/Math.PI;
      p.apply(0);s.interactions.enabled=true;s.interactions.update();
    }''')
    page.wait_for_function('window.__app.interactions.focus?.label() === "Open the refrigerator"')
    page.keyboard.press('e')
    page.wait_for_function('window.__app.fridge.openRequested')
    page.evaluate('''async () => {
      const s=window.__app,f=s.fridge,p=s.player;
      for(let i=0;i<300&&f.moving;i++)f.update(1/60);
      await s.devMenu.sys.recapture();
      const d=[1.55-p.pos.x,1.47-p.eyeY,-.70-p.pos.z];
      p.yaw=Math.atan2(-d[0],-d[2])*180/Math.PI;p.pitch=Math.atan2(d[1],Math.hypot(d[0],d[2]))*180/Math.PI;p.apply(0);
      await new Promise(resolve=>{let n=0;const h=s.app.on('frameend',()=>{if(++n===6){h.off();resolve();}});});
    }''')
    refrigerator = page.evaluate('''() => {const s=window.__app,f=s.fridge;return {
      angle:f.angle,on:f.light.light.enabled,power:f.light.light.intensity,
      jarBottom:f.jar.render.meshInstances[0].aabb.getMin().y,water:f.waterLevel,
      shadowModes:[s.flashlight.beam.light.shadowUpdateMode,s.flashlight.bounce.light.shadowUpdateMode]};}''')
    assert refrigerator['angle']==106 and refrigerator['on'] and refrigerator['power']==0.24 and 1.333<refrigerator['jarBottom']<1.334 and refrigerator['shadowModes']==[2,2],refrigerator
    page.screenshot(path=str(output/'fridge.png'),timeout=120000)
    result['refrigeratorNativeOpenAndJar'] = refrigerator
    print(f'{mode}: native refrigerator opening, final shelf contact and dynamic shadows passed',flush=True)
    # Show the rendered apartment without the intro for a visual capture.
    page.evaluate("document.querySelector('#intro').style.display = 'none'")
    page.screenshot(path=str(output / f'{mode}-{urlsplit(response.url).port or "hosted"}.png'), timeout=120000)
    assert not errors, errors
    expected_missing = lambda address: address.endswith(('/assets/apartment/apartment.json', '/favicon.ico')) and http_failures.get(address) == 404
    unexpected_requests = [request for request in failed_requests if not expected_missing(request['url'])]
    unexpected_http = {address: status for address, status in http_failures.items() if not expected_missing(address)}
    assert not unexpected_requests, unexpected_requests
    assert not unexpected_http, unexpected_http
    assert not console_errors, console_errors
    result.update({'pageErrors': errors, 'unexpectedFailedRequests': unexpected_requests, 'consoleErrors': console_errors,
                   'expectedMissingResources': http_failures,
                   'developerMenu': 'passed', 'flashlightPickup': 'passed',
                   'loadingIndicatorHidden': True, 'pointerLockEntryAndRelease': 'passed'})
    print(json.dumps(result, indent=2))
    browser.close()
