"""Matched object captures: python3 tools/capture-details.py BASE_URL OUTPUT_DIR.
Requires the cloud image Playwright/Chromium; uses a fixed inspection camera and hides only the HUD.
"""
from pathlib import Path
import sys, json
from playwright.sync_api import sync_playwright
url,out=sys.argv[1:3]
Path(out).mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    page=browser.new_page(viewport={'width':720,'height':480})
    page.set_default_timeout(180000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(url+'#webgl&q=2&shot=1.1,3.5,180,35&ev=1')
    page.wait_for_function('window.__state?.ready || window.__state?.error',timeout=600000)
    assert page.evaluate('window.__state.ready'),page.evaluate('window.__state')
    page.evaluate('''() => {const s=window.__app;s.rain.flash.next=1e9;s.rain.flash.seq=[];s.player.bobOn=false;document.getElementById('grain').style.animation='none';const stats=document.getElementById('stats');if(stats)stats.hidden=true;}''')
    def view(position,target):
        page.evaluate('''({position,target})=>{const s=window.__app;s.player.apply=()=>{s.camera.setPosition(...position);s.camera.lookAt(...target);};s.player.apply();}''',{'position':position,'target':target})
        page.evaluate('''()=>new Promise(resolve=>{let n=0;const h=window.__app.app.on('frameend',()=>{if(++n===8){h.off();resolve();}});})''')
    view([1.12,1.65,3.65],[1.13,1.15,4.4])
    page.screenshot(path=out+'/switches.png',timeout=180000);print('switches captured',flush=True)
    view([-5.25,1.6,-.05],[-5.455,1.03,-.91])
    page.evaluate('''()=>{const s=window.__app;s.devices.brew(s.devices.coffee);if(s.devices.coffee.cycle){const c=s.devices.coffee;c.playback?.stop();c.cycle.time=8;c.cycle.clock=()=>8;s.devices.updateCoffee(0);}else{s.devices.startSteam(20);}}''')
    page.evaluate('''()=>new Promise(resolve=>{let n=0;const h=window.__app.app.on('frameend',()=>{if(++n===8){h.off();resolve();}});})''')
    page.screenshot(path=out+'/coffee.png',timeout=180000);print('coffee captured',flush=True)
    page.evaluate('''()=>{const s=window.__app;for(const door of s.closets.doors){if(!door.openRequested)s.closets.toggle(door);}for(let i=0;i<240;i++)s.closets.update(1/60);}''')
    view([10.65,1.77,-.96],[9.47,1.9,-.94])
    page.screenshot(path=out+'/flashlight.png',timeout=180000);print('flashlight captured',flush=True)
    view([7.9,1.77,1.0],[6.6,1.80,1.25])
    page.screenshot(path=out+'/bathroom.png',timeout=180000);print('bathroom captured',flush=True)
    view([-.4,1.75,.4],[-.94,1.35,-1.13])
    page.screenshot(path=out+'/hood.png',timeout=180000);print('hood captured',flush=True)
    assert not errors,errors
    print(json.dumps(page.evaluate('({ready:window.__state.ready,device:window.__app.app.graphicsDevice.deviceType})')))
    browser.close()
