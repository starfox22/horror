"""Check load failures and successful startup against a running development server.

Usage: python3 tools/check-startup.py [http://127.0.0.1:5173/]
Requires Python Playwright and Chromium (CHROMIUM_PATH overrides system discovery).
"""
import argparse
import os
import shutil
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('base_url', nargs='?', default='http://127.0.0.1:5173/')
args = parser.parse_args()
url = args.base_url.rstrip('/') + '/#webgl&q=1'
chromium_path = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=chromium_path, args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    try:
        for kind, pattern, status, content, expected in [
            ('collision unavailable', '**/assets/apartment/collision.json', 503, 'unavailable', 'Collision data: HTTP 503'),
            ('broken manifest', '**/assets/apartment/apartment.json', 200, '{invalid', 'Apartment manifest is not valid JSON'),
            ('bad manifest sizes', '**/assets/apartment/apartment.json', 200, '{"bytes":12,"parts":[{"file":"a.txt","bytes":4}]}', 'Apartment manifest has invalid part sizes'),
        ]:
            page = browser.new_page(viewport={'width':480,'height':270})
            page.route(pattern, lambda route: route.fulfill(status=status, content_type='application/json', body=content))
            page.goto(url)
            page.wait_for_function('window.__state?.error', timeout=60000)
            state = page.evaluate('window.__state')
            assert state['error'] == expected, state
            assert not state['ready'], state
            assert page.locator('#retry').is_visible()
            assert page.locator('#status').inner_text() == 'Unable to load the apartment: ' + expected
            assert not page.locator('#enter').is_visible()
            print(kind, 'PASS', flush=True)
            page.close()
        page = browser.new_page(viewport={'width':480,'height':270})
        page.route('**/assets/apartment/apartment.json', lambda route: route.fulfill(status=200, content_type='text/html', body='<!doctype html><html><body>SPA fallback</body></html>'))
        page.goto(url)
        page.wait_for_function('window.__state?.ready || window.__state?.error', timeout=600000)
        state = page.evaluate('window.__state')
        assert state == {'ready':True,'error':None},state
        assert not page.locator('#loading').is_visible()
        assert not page.locator('#retry').is_visible()
        assert page.locator('#enter').is_visible()
        values=page.evaluate('''() => [...new Set(window.__app.app.root.findComponents('render').flatMap(r=>r.meshInstances.map(mi=>mi.material.diffuseMap?.anisotropy)).filter(v=>v!==undefined))]''')
        expected = page.evaluate('Math.min(8, window.__app.app.graphicsDevice.maxAnisotropy || 1)')
        assert values and all(value == expected for value in values), values
        print('HTML manifest fallback, hidden loading, entry button, anisotropy PASS',values,flush=True)
        page.locator('#enter').click()
        page.wait_for_function("document.pointerLockElement === document.getElementById('app')", timeout=60000)
        page.evaluate("window.dispatchEvent(new ErrorEvent('error', {message: 'Synthetic runtime failure', error: new Error('Synthetic runtime failure')}))")
        page.wait_for_function('document.pointerLockElement === null', timeout=60000)
        state = page.evaluate('window.__state')
        assert state == {'ready': False, 'error': 'Synthetic runtime failure'}, state
        assert not page.evaluate('window.__app.player.active'), 'Player remains active after a runtime error'
        assert page.locator('#retry').is_visible()
        assert page.locator('#loading').is_visible()
        assert not page.locator('#enter').is_visible()
        assert page.locator('#status').inner_text() == 'Unable to load the apartment: Synthetic runtime failure'
        print('Runtime error recovery releases pointer lock and exposes reload PASS', flush=True)
    finally:
        browser.close()
