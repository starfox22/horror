"""Native refrigerator action and real rendered interior check.

python3 tools/check-fridge-browser.py BASE_URL OUTPUT_DIRECTORY [--baseline]
Requires Playwright and Chromium; uses the session proxy for hosted HTTPS.
The before capture uses the same Medium/fixed-exposure inspection view. Animation
poses are stepped deterministically after native E acceptance (not a GPU benchmark).
"""
import argparse,json,os,shutil
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('url');parser.add_argument('output');parser.add_argument('--baseline',action='store_true')
args=parser.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
base=urlsplit(args.url);errors=[];console_errors=[];failed=[];http_errors={}
with sync_playwright() as p:
    options={'executable_path':os.environ.get('CHROMIUM_PATH')or shutil.which('chromium'),'args':['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']}
    proxy_url=os.environ.get('HTTPS_PROXY'if base.scheme=='https'else'HTTP_PROXY')
    if base.hostname not in('localhost','127.0.0.1','::1')and proxy_url:
        endpoint=urlsplit(proxy_url);proxy={'server':f'{endpoint.scheme}://{endpoint.hostname}:{endpoint.port or(443 if endpoint.scheme=="https"else 80)}'}
        if endpoint.username:proxy['username']=endpoint.username
        if endpoint.password:proxy['password']=endpoint.password
        options['proxy']=proxy
    browser=p.chromium.launch(**options);page=browser.new_page(viewport={'width':720,'height':480});page.set_default_timeout(180000)
    page.on('pageerror',lambda e:errors.append(str(e)));page.on('requestfailed',lambda r:failed.append({'url':r.url,'failure':r.failure}));page.on('response',lambda r:http_errors.update({r.url:r.status})if r.status>=400 else None)
    page.on('console',lambda m:console_errors.append(m.text)if m.type=='error'and not m.location.get('url','').endswith(('/apartment.json','/favicon.ico'))else None)
    page.add_init_script('Math.random=(()=>{let x=42;return()=>((x=Math.imul(x,1664525)+1013904223|0)>>>0)/4294967296;})()')
    def frames(count=4):
        page.evaluate('''n=>new Promise(resolve=>{let i=0;const h=window.__app.app.on('frameend',()=>{if(++i>=n){h.off();resolve();}});})''',count)
    def aim(target,position=None):
        page.evaluate('''({target,position})=>{const s=window.__app,p=s.player;p.bobOn=false;if(position){p.pos.set(position[0],0,position[1]);p.floor=p.grid.floorUnder(p.pos.x,p.pos.z,.22);p.eyeY=p.floor+1.62;p.vel.set(0,0,0);}const eye=[p.pos.x,p.eyeY,p.pos.z],d=target.map((v,i)=>v-eye[i]);p.yaw=Math.atan2(-d[0],-d[2])*180/Math.PI;p.pitch=Math.atan2(d[1],Math.hypot(d[0],d[2]))*180/Math.PI;p.apply(0);}''',{'target':target,'position':position})
    def act(expected):
        page.evaluate('''()=>{const s=window.__app;s.interactions.enabled=s.player.active;s.interactions.update();}''')
        page.wait_for_function('''expected=>window.__app.interactions.focus?.label()===expected''',arg=expected)
        page.keyboard.press('e')
    try:
        fragment='webgl&q=2&ev=1'+('&shot=1.12,.68,0'if args.baseline else'')
        response=page.goto(urlunsplit(base._replace(fragment=fragment)),wait_until='domcontentloaded');assert response.status==200
        page.wait_for_function('window.__state?.ready || window.__state?.error',timeout=600000);assert page.evaluate('window.__state')=={'ready':True,'error':None}
        page.evaluate('''()=>{const s=window.__app;s.rain.flash.next=1e9;s.rain.flash.seq=[];document.getElementById('grain').style.animation='none';}''')
        if args.baseline:
            # Same inspection camera as the updated open view; no new interaction.
            page.evaluate('''()=>{const s=window.__app;s.player.apply=()=>{s.camera.setPosition(1.12,1.85,.68);s.camera.lookAt(1.55,1.47,-.70);};s.player.apply();document.getElementById('stats').hidden=true;}''')
            frames();page.screenshot(path=str(out/'fridge.png'));print('Baseline refrigerator capture PASS',flush=True)
        else:
            f=page.evaluate('''()=>{const f=window.__app.fridge;return{angle:f.angle,on:f.light.light.enabled,intensity:f.light.light.intensity,emission:f.glow.emissiveIntensity,moving:f.movingTriangles,cap:f.removedCapTriangles,waterLevel:f.waterLevel,jarHeight:f.jarHeight,cast:f.light.light.castShadows};}''')
            assert f['angle']==0 and not f['on']and f['intensity']==0 and f['emission']==0,f
            assert f['moving']>1000 and 0<f['cap']<50 and f['cast'],f
            assert 1.53<f['waterLevel']<1.55 and .28<f['jarHeight']<.29,f
            print('Closed refrigerator, authored geometry and interior defaults PASS',flush=True)
            # Freeze an actual opening pose for its requested caption capture.
            page.evaluate('''()=>{window.__savedWakeClock=window.__app.wake.clock;window.__app.wake.clock=()=>3.4;}''')
            page.locator('#enter').click();page.wait_for_function('document.pointerLockElement===document.getElementById("app") && window.__app.wake.running')
            page.evaluate('''()=>{const w=window.__app.wake;w.time=3.4;w.lastTime=3.4;w.apply();}''');frames()
            page.screenshot(path=str(out/'wake-lying.png'))
            page.evaluate('''()=>{const w=window.__app.wake;w.clock=window.__savedWakeClock;w.lastTime=null;}''')
            page.keyboard.press('Space');page.wait_for_function('window.__app.wake.completed && window.__app.player.active')
            page.evaluate('''()=>{document.getElementById('stats').hidden=true;}''')
            aim([1.55,1.47,-.70],[1.12,.68]);frames();page.screenshot(path=str(out/'fridge-closed.png'))
            handle=page.evaluate('window.__app.fridge.handle.toArray()');aim(handle);act('Open the refrigerator')
            page.wait_for_function('window.__app.fridge.openRequested')
            # Keep the expensive software renderer from stretching a seconds-long
            # door inspection into minutes: step the real class after native input.
            page.evaluate('''()=>{const f=window.__app.fridge;for(let i=0;i<300&&f.moving;i++)f.update(1/60);}''')
            page.wait_for_function('!window.__app.fridge.moving');assert page.evaluate('window.__app.fridge.angle')==106
            assert page.evaluate('window.__app.fridge.light.light.enabled && window.__app.fridge.light.light.intensity===.24')
            aim([1.55,1.47,-.70]);frames(6);page.screenshot(path=str(out/'fridge.png'))
            state=page.evaluate('''()=>{const f=window.__app.fridge;const jar=f.jar.render.meshInstances[0];return{angle:f.angle,handle:f.handle.toArray(),light:f.light.getPosition().toArray(),waterLevel:f.waterLevel,jarMin:jar.aabb.getMin().toArray(),jarMax:jar.aabb.getMax().toArray(),leafCast:f.door.findComponents('render').filter(r=>r.meshInstances.some(mi=>mi.castShadow)).length,probes:window.__app.probes.levels};}''')
            assert state['leafCast']>=3,state
            assert 1.333<state['jarMin'][1]<1.334 and state['jarMax'][1]<1.625,state
            print('Native E opening, cold light, authored jar and real frame capture PASS',flush=True)
            handle=page.evaluate('window.__app.fridge.handle.toArray()');aim(handle);act('Close the refrigerator')
            page.wait_for_function('!window.__app.fridge.openRequested');page.evaluate('''()=>{const f=window.__app.fridge;for(let i=0;i<300&&f.moving;i++)f.update(1/60);}''');frames()
            assert page.evaluate('window.__app.fridge.angle===0 && !window.__app.fridge.light.light.enabled && window.__app.fridge.glow.emissiveIntensity===0')
            print('Native E closing, moving target and sealed/off light PASS',flush=True)
            # Replay ensures opening is reversible without replacing meshes/lights.
            aim(page.evaluate('window.__app.fridge.handle.toArray()'));act('Open the refrigerator');page.wait_for_function('window.__app.fridge.openRequested');page.evaluate('''()=>{const f=window.__app.fridge;for(let i=0;i<300&&f.moving;i++)f.update(1/60);}''');frames()
            assert page.evaluate('window.__app.fridge.angle===106 && window.__app.fridge.light.light.enabled')
            state['nativeAction']='open/close/reopen';state['animationInspection']='real class stepped after native E; GPU correctness, not throughput';print(json.dumps(state),flush=True)
        optional=lambda u:urlsplit(u).path.endswith(('/apartment.json','/favicon.ico'))
        assert not errors,errors;assert not console_errors,console_errors
        assert not [r for r in failed if not optional(r['url'])],failed
        assert not {u:s for u,s in http_errors.items()if not optional(u)},http_errors
        print(json.dumps({'pageErrors':errors,'consoleErrors':console_errors,'unexpectedRequests':[]}),flush=True)
    finally:browser.close()
