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
    page.set_default_timeout(60000)
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
    assert result['rooms'] == 7 and result['lamps'] >= 4, result
    assert result['frame'] > 0 and result['floor'] > 0, result
    assert len(result['probeLevels']) == 8 and all(isinstance(v, (int, float)) and 0 <= v < float('inf') for v in result['probeLevels']), result
    assert any(v > 0 for v in result['probeLevels']), result
    if mode == 'webgpu':
        assert result['device'] == 'webgpu', result
    else:
        assert result['device'] == 'webgl2', result
    page.locator('#enter').click()
    page.wait_for_function('document.pointerLockElement === document.getElementById("app")')
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
