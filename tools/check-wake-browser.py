"""Native opening checks; optional held-timeline, real-engine storyboard captures.

Usage: python3 tools/check-wake-browser.py [BASE_URL] [--capture DIRECTORY]
The 12-second and reduced-motion runs use real active wall time. Captures use a
separate fresh game, hold the existing WakeSequence clock at named poses, then
restore it before exercising native Space skip. No image edits or fake geometry.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import time
from urllib.parse import urlsplit, urlunsplit
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('base', nargs='?', default='http://127.0.0.1:4175/')
parser.add_argument('--capture', type=Path)
args = parser.parse_args()
base = urlsplit(args.base)
results = {}
errors = []

with sync_playwright() as p:
    launch = {'executable_path': os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),
              'args': ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']}
    proxy_url = os.environ.get('HTTPS_PROXY' if base.scheme == 'https' else 'HTTP_PROXY')
    if base.hostname not in ('localhost', '127.0.0.1', '::1') and proxy_url:
        endpoint = urlsplit(proxy_url)
        proxy = {'server': f'{endpoint.scheme}://{endpoint.hostname}:{endpoint.port or (443 if endpoint.scheme == "https" else 80)}'}
        if endpoint.username:
            proxy['username'] = endpoint.username
        if endpoint.password:
            proxy['password'] = endpoint.password
        launch['proxy'] = proxy
    browser = p.chromium.launch(**launch)

    def fresh(reduced=False, quality=1, viewport=None):
        context = browser.new_context(viewport=viewport or {'width': 480, 'height': 320},
                                      reduced_motion='reduce' if reduced else 'no-preference')
        page = context.new_page()
        page.set_default_timeout(120000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        url = urlunsplit(base._replace(fragment=f'webgl&q={quality}'))
        response = page.goto(url, wait_until='domcontentloaded')
        assert response and response.status == 200
        page.wait_for_function('window.__state?.ready || window.__state?.error', timeout=600000)
        assert page.evaluate('window.__state') == {'ready': True, 'error': None}
        assert page.evaluate('!!window.__app.wake && !window.__app.wake.started && !window.__app.wake.completed')
        position = page.evaluate('window.__app.camera.getPosition().toArray()')
        if not reduced:
            assert 13 < position[0] < 13.6 and 1.05 < position[1] < 1.2 and -0.44 < position[2] < 1.46, position
        return context, page

    def enter(page):
        page.bring_to_front()
        page.locator('#enter').click()
        page.wait_for_function('document.pointerLockElement === document.getElementById("app") && window.__app.wake.running && window.__app.wake.locked')
        assert page.evaluate('!window.__app.player.active && window.__app.player.keys.size === 0')
        assert page.locator('#reticle').is_hidden()

    def assert_landing(page):
        state = page.evaluate('''() => { const s=window.__app, p=s.player;
          return {done:s.wake.completed, active:p.active, pos:p.pos.toArray(), eye:p.eyeY,
            floor:p.floor, yaw:p.yaw, pitch:p.pitch, fits:p.grid.fits(p.pos.x,p.pos.z,.22,p.floor),
            text:document.querySelector('.wake-dialogue').textContent, overlay:document.getElementById('wake-sequence').hidden};
        }''')
        assert state['done'] and state['active'] and state['fits'] and state['overlay'], state
        assert abs(state['pos'][0] - 12.85) < 0.001 and abs(state['pos'][2] - 1.80) < 0.001, state
        assert abs(state['eye'] - state['floor'] - 1.62) < 0.001, state
        assert abs(state['yaw'] - 112) < 0.001 and abs(state['pitch'] + 2) < 0.001, state
        assert state['text'] == 'I just had a nightmare, I will go get some water at the kitchen'
        return state

    try:
        context, page = fresh()
        enter(page)
        page.wait_for_function('window.__app.wake.time >= 2.8 && !window.__app.wake.completed')
        assert page.evaluate('Number(getComputedStyle(document.querySelector(".wake-dialogue")).opacity) > 0')
        page.keyboard.press('w')
        assert page.evaluate('window.__app.player.keys.size === 0'), 'Movement must remain blocked during the opening'
        page.keyboard.press('g')
        page.wait_for_function('document.getElementById("graphics-dialog").open && !window.__app.wake.locked && document.pointerLockElement === null')
        paused = page.evaluate('window.__app.wake.time')
        page.wait_for_timeout(1200)
        assert page.evaluate('window.__app.wake.time') == paused, 'Graphics/pointer unlock must pause cinematic time'
        assert page.locator('#wake-sequence').is_hidden()
        page.keyboard.press('g')
        page.wait_for_function('!document.getElementById("graphics-dialog").open')
        enter(page)
        resumed_at = time.monotonic()
        page.wait_for_function('window.__app.wake.completed && window.__app.player.active')
        elapsed = time.monotonic() - resumed_at
        state = assert_landing(page)
        total = page.evaluate('window.__app.wake.time')
        assert 12 <= total < 25, total
        assert elapsed < 35, 'Wall-clock animation must not stretch with the software renderer dt clamp'
        assert elapsed >= max(0, 12 - paused - 1.5), (elapsed, paused)
        page.keyboard.press('g')
        page.wait_for_function('document.getElementById("graphics-dialog").open')
        page.keyboard.press('g')
        page.wait_for_function('!document.getElementById("graphics-dialog").open')
        page.locator('#enter').click()
        page.wait_for_function('window.__app.player.active')
        assert page.evaluate('window.__app.wake.completed && !window.__app.wake.running')
        results['normal'] = {'duration': total, 'pausedAt': paused, 'resumeWallSeconds': elapsed,
                             'landing': state, 'restartOnResume': False}
        print('Natural wake, movement lock, graphics pause/resume and standing handoff PASS', flush=True)
        context.close()

        context, page = fresh(quality=2 if args.capture else 1, viewport={'width': 720, 'height': 480} if args.capture else None)
        # Force the local face to load, then verify the actual FontFace rather
        # than treating a successful Georgia fallback as the requested font.
        font = page.evaluate('''async () => {
          const loaded=await document.fonts.load('500 28px "Cormorant Garamond"');
          return {count:loaded.length, status:loaded[0]?.status, family:loaded[0]?.family};
        }''')
        assert font['count'] == 1 and font['status'] == 'loaded' and 'Cormorant Garamond' in font['family'], font
        enter(page)
        if args.capture:
            args.capture.mkdir(parents=True, exist_ok=True)
            page.evaluate('''() => {const s=window.__app; s.rain.flash.next=1e9; s.rain.flash.seq=[];
              document.getElementById('stats').hidden=true; document.getElementById('grain').style.animation='none';
              window.savedWakeClock=s.wake.clock;}''')
            captures = []
            for name, phase in [('wake-lying', 3.4), ('wake-sitting', 5.8)]:
                page.evaluate('''time => {const w=window.__app.wake; w.time=time; w.clock=()=>time; w.lastTime=time; w.apply();}''', phase)
                page.evaluate('''() => new Promise(resolve => { let n=0; const h=window.__app.app.on('frameend',()=>{if(++n===4){h.off();resolve();}});})''')
                target = args.capture / f'{name}.png'
                page.screenshot(path=str(target), timeout=180000)
                captures.append({'path':str(target), 'time':phase})
            page.evaluate('''() => {const w=window.__app.wake; w.clock=window.savedWakeClock; w.lastTime=null;}''')
            results['captures'] = {'method':'real engine at held existing WakeSequence clock, Medium quality, fixed cameras from timeline; no image edits', 'frames':captures}
        # Entry commonly keeps button focus after mouse lock. Space must still
        # skip instead of clicking that focused button a second time.
        page.locator('#enter').evaluate('(button) => button.focus()')
        assert page.evaluate('document.activeElement.id') == 'enter'
        page.keyboard.press('Space')
        page.wait_for_function('window.__app.wake.completed && window.__app.player.active')
        results['skip'] = {'focusedEntryButton': True, 'landing': assert_landing(page), 'font':font}
        print('Focused-button native Space skip and locally loaded dialogue font PASS', flush=True)
        context.close()

        context, page = fresh(reduced=True)
        initial = page.evaluate('window.__app.camera.getPosition().toArray()')
        enter(page)
        page.wait_for_function('window.__app.wake.time >= 2')
        current = page.evaluate('window.__app.camera.getPosition().toArray()')
        assert initial == current, (initial, current)
        assert page.evaluate('Number(getComputedStyle(document.querySelector(".wake-dialogue")).opacity) > .9')
        page.wait_for_function('window.__app.wake.completed && window.__app.player.active')
        total = page.evaluate('window.__app.wake.time')
        assert 6.5 <= total < 20, total
        results['reducedMotion'] = {'stationary':True, 'duration':total, 'landing':assert_landing(page)}
        context.close()
        print('Stationary reduced-motion opening and standing handoff PASS', flush=True)
        assert not errors, errors
        print(json.dumps({'wakeChecks':results, 'pageErrors':errors}, indent=2))
    finally:
        browser.close()
