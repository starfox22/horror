"""Capture matched high-quality room views. Usage: capture-review.py BASE_URL OUTPUT_DIR."""
import sys, json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
url, out = sys.argv[1:3]
Path(out).mkdir(parents=True, exist_ok=True)
views = [('living', [-1.5, 1.5, 90, -3]), ('office', [1.7, 1.6, -75, -3]), ('bedroom', [11.5, 1.3, -35, -5]), ('hall', [13, 3.55, 90, 0])]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    page=browser.new_page(viewport={'width':960,'height':540})
    page.set_default_timeout(120000)
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script('Math.random = (() => { let s=42; return () => ((s=Math.imul(1664525,s)+1013904223|0)>>>0)/4294967296; })()')
    page.goto(url+'#webgl&q=3&shot=-1.5,1.5,90,-3&ev=1')
    page.wait_for_function('window.__state?.ready || window.__state?.error',timeout=600000)
    assert page.evaluate('window.__state.ready'), page.evaluate('window.__state')
    page.evaluate('''() => { const s=window.__app; s.rain.flash.next=1e9; s.rain.flash.seq=[]; s.player.bobOn=false; document.getElementById('grain').style.animation='none'; }''')
    for name, pos in views:
        page.evaluate('''v => {const s=window.__app; s.player.pos.set(v[0],0,v[1]); s.player.floor=s.player.grid.floorUnder(v[0],v[1],.22); s.player.yaw=v[2]; s.player.pitch=v[3]; s.player.eyeY=s.player.floor+1.62; s.player.apply(0); s.frame.renderPassCamera?.taaPass?.reset?.();}''',pos)
        page.evaluate('''() => new Promise(resolve => {let n=0; const h=window.__app.app.on('frameend',()=>{if(++n===20){h.off();resolve();}});})''')
        page.screenshot(path=f'{out}/{name}.png',timeout=120000)
        print(name,'captured',flush=True)
    assert not errors,errors
    print(json.dumps(page.evaluate('({state:window.__state,probes:window.__app.probes.levels})')))
    browser.close()
