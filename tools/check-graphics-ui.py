"""Exercise graphics controls, FPS, persistence and mouse capture in Chromium.

Usage: python3 tools/check-graphics-ui.py [BASE_URL] [--screenshot [PNG_PATH]]
The optional screenshot is a real 720x800 capture; the default output is /tmp.
Requires Python Playwright and Chromium. CHROMIUM_PATH overrides discovery.
"""
import argparse
import json
import os
import shutil
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('base_url', nargs='?', default='http://127.0.0.1:5173/')
parser.add_argument('--screenshot', nargs='?', const='/tmp/horror-graphics-menu.png')
args = parser.parse_args()
base = urlsplit(args.base_url)
base_url = urlunsplit(base._replace(fragment=''))
initial_url = urlunsplit(base._replace(fragment='webgl&q=1'))
errors, console_errors, failed_requests, http_errors = [], [], [], {}
results = {}

with sync_playwright() as p:
    options = {
        'executable_path': os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),
        'args': ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    }
    proxy_url = os.environ.get('HTTPS_PROXY' if base.scheme == 'https' else 'HTTP_PROXY')
    if base.hostname not in ('localhost', '127.0.0.1', '::1') and proxy_url:
        endpoint = urlsplit(proxy_url)
        proxy = {'server': f'{endpoint.scheme}://{endpoint.hostname}:{endpoint.port or (443 if endpoint.scheme == "https" else 80)}'}
        if endpoint.username:
            proxy['username'] = endpoint.username
        if endpoint.password:
            proxy['password'] = endpoint.password
        options['proxy'] = proxy
    browser = p.chromium.launch(**options)
    context = browser.new_context(viewport={'width': 480, 'height': 320})
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('requestfailed', lambda request: failed_requests.append({'url': request.url, 'failure': request.failure}))
    page.on('response', lambda response: http_errors.update({response.url: response.status}) if response.status >= 400 else None)

    def optional(address):
        return urlsplit(address).path.endswith(('/assets/apartment/apartment.json', '/favicon.ico'))

    def collect_console(message):
        if message.type == 'error' and not optional(message.location.get('url', '')):
            console_errors.append({'text': message.text, 'url': message.location.get('url', '')})

    page.on('console', collect_console)

    def ready():
        page.wait_for_function('window.__state?.ready || window.__state?.error', timeout=600000)
        state = page.evaluate('window.__state')
        assert state == {'ready': True, 'error': None}, state

    def snapshot():
        return page.evaluate('''() => {
          const g = window.__app.graphics, frame = window.__app.frame;
          return {settings: {...g.settings}, effective: {...g.effective},
            scale: frame.rendering.renderTargetScale,
            actualScale: frame.renderPassCamera.renderTargetScale,
            ao: frame.ssao.type !== 'none', fog: frame.volumetricFog.enabled,
            bloom: frame.bloom.intensity > 0, taa: frame.taa.enabled,
            grain: !document.getElementById('grain').hidden,
            fps: !document.getElementById('stats').hidden,
            fpsLimit: window.__app.frameLimiter.limit,
            fpsElements: document.querySelectorAll('#stats').length};
        }''')

    def open_menu():
        page.locator('#graphics-open').click()
        page.wait_for_function('document.getElementById("graphics-dialog").open')
        assert page.get_by_role('dialog', name='Graphics').is_visible()
        assert page.locator('#graphics-open').get_attribute('aria-expanded') == 'true'

    def close_menu(key='Escape'):
        page.keyboard.press(key)
        page.wait_for_function('!document.getElementById("graphics-dialog").open && document.getElementById("graphics-open").getAttribute("aria-expanded") === "false"')
        assert page.locator('#graphics-open').get_attribute('aria-expanded') == 'false'

    def choose(preset):
        page.locator('#graphics-preset').select_option(preset)
        page.wait_for_function('(value) => window.__app.graphics.settings.preset === value', arg=preset)
        return snapshot()

    def toggle(option, value):
        page.locator(f'[data-option="{option}"]').set_checked(value)
        if option == 'showFps':
            page.wait_for_function('(value) => window.__app.graphics.settings.showFps === value', arg=value)
        else:
            page.wait_for_function('(args) => window.__app.graphics.effective[args[0]] === args[1]', arg=[option, value])
        return snapshot()

    try:
        response = page.goto(initial_url, wait_until='domcontentloaded')
        assert response and response.status == 200, 'Page HTML request failed'
        ready()
        page.wait_for_function('/^\\d+ FPS/.test(document.getElementById("stats").textContent)')
        assert page.locator('#stats').is_visible(), 'FPS must be on for a fresh browser'
        assert page.locator('#stats').count() == 1
        assert snapshot()['fpsLimit'] == -1, 'A fresh browser must use the VSync default'
        assert page.evaluate('localStorage.getItem("horror.graphics.v2")') is None, 'A fresh context must not inherit preferences'
        results['freshFps'] = 'visible, one element'
        print('Fresh FPS counter PASS', flush=True)

        open_menu()
        assert page.evaluate('document.activeElement.id') == 'graphics-preset'
        page.keyboard.press('Shift+Tab')
        assert page.evaluate('document.activeElement.id') == 'graphics-close'
        page.keyboard.press('Shift+Tab')
        assert page.evaluate('document.activeElement.id') == 'graphics-done', 'Modal must trap keyboard focus'
        page.locator('#graphics-preset').focus()
        close_menu('g')             # G must work even with a SELECT focused.
        open_menu()
        close_menu()                # Native Escape returns to the pause/start screen.
        results['modalKeyboard'] = 'focus trap, G close on SELECT, Escape close'

        page.bring_to_front()
        page.locator('#enter').click()
        page.wait_for_function('document.pointerLockElement === document.getElementById("app") && (window.__app.player.active || window.__app.wake?.running)')
        if page.evaluate('!!window.__app.wake?.running'):
            page.keyboard.press('Space')
        page.wait_for_function('document.pointerLockElement === document.getElementById("app") && window.__app.player.active')
        page.wait_for_function('Number(getComputedStyle(document.getElementById("intro")).opacity) < 0.01')
        page.keyboard.press('g')
        page.wait_for_function('document.getElementById("graphics-dialog").open && document.pointerLockElement === null && !window.__app.player.active')
        assert page.evaluate('window.__app.player.keys.size') == 0, 'Opening graphics must clear movement keys'
        results['openWhileWalking'] = 'paused and pointer lock released'
        print('Menu access and mouse capture PASS', flush=True)

        for preset, expected in (
            ('low', {'scale': 0.75, 'ao': True, 'fog': False}),
            ('medium', {'scale': 0.85, 'ao': True, 'fog': False}),
            ('high', {'scale': 1, 'ao': True, 'fog': True}),
            ('auto', {'scale': 1, 'ao': True, 'fog': True}),
        ):
            state = choose(preset)
            for field, value in expected.items():
                assert state[field] == value, (preset, field, state)
            assert page.locator('#graphics-preset').input_value() == preset
        results['presets'] = 'Low, Medium, High, Auto update the render pipeline'

        choose('low')
        for limit in (-1, 0, 30, 60, 90, 120):
            page.locator('#graphics-fps-limit').select_option(str(limit))
            state = snapshot()
            assert state['fpsLimit'] == state['settings']['fpsLimit'] == limit, state
            assert state['settings']['preset'] == 'low', 'FPS cap must not change quality'
            assert state['fps'], 'FPS cap must not switch off the counter'
        results['fpsLimitControl'] = 'VSync, every refresh, 30, 60, 90 and 120 apply without changing quality or FPS visibility'
        state = toggle('showFps', False)
        assert state['settings']['preset'] == 'low', 'FPS display must not change graphics quality'
        assert not page.locator('#stats').is_visible()
        for _ in range(2):
            toggle('showFps', True)
            assert page.locator('#stats').is_visible()
            assert page.locator('#stats').count() == 1, 'FPS toggle must reuse its HUD'
            toggle('showFps', False)
        toggle('showFps', True)

        for option, engine_field in (
            ('ambientOcclusion', 'ao'), ('volumetricFog', 'fog'), ('bloom', 'bloom'),
            ('taa', 'taa'), ('filmGrain', 'grain'),
        ):
            original = snapshot()[engine_field]
            for value in (not original, original):
                state = toggle(option, value)
                assert state[engine_field] == value, (option, value, state)
                assert state['settings']['preset'] == 'custom'
        page.locator('#graphics-resolution').select_option('0.85')
        state = snapshot()
        assert state['scale'] == state['actualScale'] == 0.85, state
        assert page.locator('#graphics-resolution').input_value() == '0.85'
        results['effectControls'] = 'AO, volumetrics, bloom, TAA, grain, resolution and FPS applied'
        print('Presets and independent effects PASS', flush=True)

        # Close before native quality hotkeys; form controls deliberately keep their keys.
        close_menu()
        page.keyboard.press('2')
        page.wait_for_function('window.__app.graphics.settings.preset === "medium"')
        assert page.locator('#graphics-preset').input_value() == 'medium'
        page.keyboard.press('1')
        page.wait_for_function('window.__app.graphics.settings.preset === "low"')
        assert page.locator('#graphics-preset').input_value() == 'low'
        results['qualityHotkeys'] = 'menu remains synchronized with keys 1 and 2'

        open_menu()
        page.locator('#graphics-resolution').select_option('0.5')
        toggle('bloom', False)
        toggle('taa', False)
        toggle('filmGrain', False)
        toggle('showFps', False)
        page.locator('#graphics-fps-limit').select_option('30')
        before = snapshot()
        assert before['settings']['preset'] == 'custom'
        # Remove the temporary q=1 URL override, then perform a genuine application reload.
        clean_url = urlunsplit(urlsplit(base_url)._replace(fragment='webgl'))
        response = page.goto(clean_url, wait_until='domcontentloaded')
        # Hash-only navigation does not reboot; reload is required to exercise persisted startup.
        page.reload(wait_until='domcontentloaded')
        ready()
        after = snapshot()
        assert after['settings'] == before['settings'], (before, after)
        for field in ('scale', 'actualScale', 'ao', 'fog', 'bloom', 'taa', 'grain', 'fps', 'fpsLimit'):
            assert after[field] == before[field], (field, before, after)
        assert after['fpsElements'] == 1 and not page.locator('#stats').is_visible()
        assert page.locator('#graphics-fps-limit').input_value() == '30'
        results['reloadPersistence'] = 'Custom settings, 30 FPS cap and explicit counter preference restored without q override'
        print('Preference reload PASS', flush=True)

        open_menu()
        toggle('showFps', True)
        page.set_viewport_size({'width': 320, 'height': 480})
        page.locator('#graphics-done').scroll_into_view_if_needed()
        bounds = page.locator('#graphics-done').bounding_box()
        assert bounds and 0 <= bounds['y'] and bounds['y'] + bounds['height'] <= 480, bounds
        dimensions = page.locator('#graphics-dialog').evaluate('(dialog) => ({width:dialog.clientWidth, scroll:dialog.scrollWidth, left:dialog.getBoundingClientRect().left, right:dialog.getBoundingClientRect().right})')
        assert dimensions['scroll'] <= dimensions['width'] + 1, dimensions
        assert 0 <= dimensions['left'] and dimensions['right'] <= 320, dimensions
        for selector in ('#graphics-preset', '#graphics-resolution', '#graphics-fps-limit', '[data-option="showFps"]'):
            control = page.locator(selector)
            control.scroll_into_view_if_needed()
            assert control.is_visible()
            element_id = control.get_attribute('id')
            assert page.locator(f'label[for="{element_id}"]').count() == 1, 'Every control needs a label'
        results['smallViewport'] = '320x480: controls reachable, labelled and no horizontal dialog overflow'
        close_menu()

        if args.screenshot:
            page.set_viewport_size({'width': 720, 'height': 800})
            open_menu()
            page.locator('#graphics-preset').scroll_into_view_if_needed()
            destination = Path(args.screenshot)
            destination.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(destination))
            results['screenshot'] = str(destination)
            close_menu()

        # SwiftShader cannot benchmark apartment throughput at 60+ FPS. Keep the
        # real PlayCanvas tick and installed limiter, but stub update/render work
        # briefly to prove they are actually scheduled at the selected cadence.
        # Deterministic Node checks separately cover 60/120/144 Hz display clocks.
        page.bring_to_front()
        results['fastTickCadence'] = page.evaluate('''async () => {
          const {app, frameLimiter} = window.__app;
          const update = app.update, render = app.render, savedLimit = frameLimiter.limit;
          let updates = 0, renders = 0, frames = 0, rawFrames = 0, rawRequest;
          const countFrame = () => frames++;
          const countRaw = () => { rawFrames++; rawRequest = requestAnimationFrame(countRaw); };
          app.update = () => updates++;
          app.render = () => renders++;
          app.on('frameend', countFrame);
          const measurements = [], warmup = [];
          const diagnostics = window.__frameLimiterMeasurements = {warmup, measurements};
          try {
            // SwiftShader's compositor can continue processing viewport work
            // for seconds after render is stubbed. Wait for measured steady RAF
            // supply instead of treating that transient as limiter throughput.
            frameLimiter.setLimit(0);
            rawRequest = requestAnimationFrame(countRaw);
            let stable = 0;
            for (let attempt = 0; attempt < 40 && stable < 3; attempt++) {
              frames = rawFrames = 0;
              const start = performance.now();
              await new Promise(resolve => setTimeout(resolve, 500));
              const elapsed = performance.now() - start;
              const sample = {elapsed, fps:frames * 1000 / elapsed, rawFps:rawFrames * 1000 / elapsed};
              warmup.push(sample);
              stable = elapsed < 800 && sample.fps >= 45 && sample.rawFps >= 50 ? stable + 1 : 0;
            }
            if (stable < 3) throw new Error(`Fast tick harness never reached stable RAF supply: ${JSON.stringify(diagnostics)}`);
            for (const limit of [0, 30, 60, 90, 120]) {
              frameLimiter.setLimit(limit);
              await new Promise(resolve => setTimeout(resolve, 100));
              updates = renders = frames = rawFrames = 0;
              const start = performance.now();
              await new Promise(resolve => setTimeout(resolve, 1500));
              const elapsed = performance.now() - start;
              if (updates !== renders || frames !== renders) throw new Error('Tick, draw and FPS frame counts diverged');
              measurements.push({limit, frames, rawFrames, updates, renders, elapsed, fps:frames * 1000 / elapsed, rawFps:rawFrames * 1000 / elapsed});
            }
          } finally {
            cancelAnimationFrame(rawRequest);
            app.update = update;
            app.render = render;
            app.off('frameend', countFrame);
            frameLimiter.setLimit(savedLimit);
          }
          const refresh = measurements[0].fps;
          if (refresh < 45) throw new Error(`Fast tick harness is starved (${refresh.toFixed(1)} FPS): ${JSON.stringify(diagnostics)}`);
          for (const result of measurements.slice(1)) {
            // Other software-rendered contexts can change the browser's RAF
            // supply between samples. Compare against callbacks offered during
            // this sample, while keeping the uncapped throughput guard above.
            const expected = Math.min(result.rawFps, result.limit);
            if (Math.abs(result.fps - expected) > Math.max(4, expected * 0.12)) {
              throw new Error(`Real tick cap ${result.limit}: ${result.fps.toFixed(1)} FPS, expected ${expected.toFixed(1)}: ${JSON.stringify(diagnostics)}`);
            }
          }
          return {method:'real engine tick; update/render work stubbed, not an apartment GPU benchmark', warmup, measurements};
        }''')
        print('Real engine tick FPS limiter PASS', flush=True)

        assert not errors, errors
        assert not console_errors, console_errors
        unexpected_http = {address: status for address, status in http_errors.items() if not optional(address)}
        unexpected_requests = [request for request in failed_requests if not optional(request['url'])]
        assert not unexpected_http, unexpected_http
        assert not unexpected_requests, unexpected_requests
        print(json.dumps({'graphicsUi': results, 'pageErrors': errors, 'consoleErrors': console_errors,
                          'unexpectedHttpErrors': unexpected_http, 'unexpectedFailedRequests': unexpected_requests}, indent=2))
    except Exception:
        try:
            print(json.dumps({'completed': results, 'diagnostics': page.evaluate('({state:window.__state, graphics:window.__app?.graphics?.settings, frameLimiter:window.__frameLimiterMeasurements, dialogOpen:document.getElementById("graphics-dialog")?.open, fpsCount:document.querySelectorAll("#stats").length})')}), flush=True)
        except Exception:
            pass
        raise
    finally:
        browser.close()
