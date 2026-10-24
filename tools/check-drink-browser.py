"""Native second-E drinking, camera/input ownership, pauses and real rendered poses.
Usage: python3 tools/check-drink-browser.py BASE_URL OUTPUT_DIR [webgl|webgpu]
This is a functional/render check on SwiftShader, not a hardware FPS benchmark.
"""
import os,sys,json,shutil
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
url,out=sys.argv[1:3];mode=sys.argv[3]if len(sys.argv)>3 else'webgl';Path(out).mkdir(parents=True,exist_ok=True)
quality=int(os.environ.get('DRINK_QUALITY','1'));assert quality in(1,2,3)
errors=[];bad=[];console=[]
with sync_playwright()as p:
    flags=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
    if mode=='webgpu':flags+=['--enable-unsafe-webgpu','--use-webgpu-adapter=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader']
    opts={'executable_path':os.environ.get('CHROMIUM_PATH')or shutil.which('chromium'),'args':flags}
    target=urlsplit(url)
    if target.hostname not in('localhost','127.0.0.1','::1'):
        ep=urlsplit(os.environ['HTTPS_PROXY']);opts['proxy']={'server':f'{ep.scheme}://{ep.hostname}:{ep.port}'}
    browser=p.chromium.launch(**opts);page=browser.new_page(viewport={'width':720,'height':480});page.set_default_timeout(180000)
    page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:console.append(m.text)if m.type=='error'and not m.location.get('url','').endswith(('/apartment.json','/favicon.ico'))else None)
    page.on('response',lambda r:bad.append([r.url,r.status])if r.status>=400 and not urlsplit(r.url).path.endswith(('/apartment.json','/favicon.ico'))else None)
    page.add_init_script('Math.random=(()=>{let x=42;return()=>((x=Math.imul(x,1664525)+1013904223|0)>>>0)/4294967296;})()')
    def frames(n=4):page.evaluate('''n=>new Promise(resolve=>{let i=0;const h=window.__app.app.on('frameend',()=>{if(++i>=n){h.off();resolve();}});})''',n)
    def state():return page.evaluate('''()=>{const s=window.__app,d=s.drink;return{running:d.running,time:d.time,active:s.player.active,locked:!!document.pointerLockElement,audio:d.audio.playing,nodes:d.audio.nodes.length,carried:d.carried,fill:s.fridge.glassFill,parent:s.fridge.glass.parent.name,hand:d.handCarrier.enabled};}''')
    try:
        page.goto(url+f'#{"webgl&"if mode=="webgl"else""}q={quality}&ev=1',wait_until='domcontentloaded')
        page.wait_for_function('window.__state?.ready || window.__state?.error',timeout=600000);assert page.evaluate('window.__state')=={'ready':True,'error':None},errors
        s=page.evaluate('''()=>{const s=window.__app;s.rain.flash.next=1e9;s.rain.flash.seq=[];document.getElementById('grain').style.animation='none';document.getElementById('stats').hidden=true;return{device:s.app.graphicsDevice.deviceType,clips:s.drink.audio.clips.map(c=>({start:c.start,duration:c.buffer.duration})),limit:s.frameLimiter.limit,handMeshes:s.drink.hand.findComponents('render').length};}''')
        assert s['limit']==60 and len(s['clips'])==4 and s['handMeshes']>0,s
        assert s['device']==('webgpu'if mode=='webgpu'else'webgl2'),s
        page.locator('#enter').click();page.wait_for_function('window.__app.wake.running');page.keyboard.press('Space');page.wait_for_function('window.__app.player.active')
        page.evaluate('''()=>{const s=window.__app,p=s.player;p.bobOn=false;p.pos.set(1.12,0,.68);p.floor=p.grid.floorUnder(p.pos.x,p.pos.z,.22);p.eyeY=p.floor+1.62;p.vel.set(0,0,0);const d=s.fridge.handle.clone().sub(new (p.pos.constructor)(p.pos.x,p.eyeY,p.pos.z));p.yaw=Math.atan2(-d.x,-d.z)*180/Math.PI;p.pitch=Math.atan2(d.y,Math.hypot(d.x,d.z))*180/Math.PI;p.apply(0);s.interactions.enabled=true;s.interactions.update();}''')
        page.wait_for_function('window.__app.interactions.focus?.label()==="Open the refrigerator"');page.keyboard.press('e');page.wait_for_function('window.__app.fridge.openRequested')
        page.evaluate('''()=>{const f=window.__app.fridge;for(let i=0;i<300&&f.moving;i++)f.update(1/60);window.__app.interactions.update();}''')
        page.wait_for_function('window.__app.interactions.focus?.label()==="Take the glass and drink water"')
        print('Native E opening; unchanged view offers glass on second E',flush=True)
        page.evaluate('''()=>{window.__app.drink.clock=()=>0;}''');page.keyboard.press('e');page.wait_for_function('window.__app.drink.running');assert not state()['active'],state()
        page.keyboard.press('e');page.keyboard.press('w');assert page.evaluate('window.__app.fridge.openRequested && !window.__app.player.active && window.__app.drink.time===0')
        page.evaluate('''()=>{const d=window.__app.drink;d.time=.8;d.lastTime=.8;d.clock=()=>.8;d.update();}''');frames();page.screenshot(path=str(Path(out)/'drink-reach.png'))
        page.evaluate('''()=>{const d=window.__app.drink;d.time=1.8;d.lastTime=1.8;d.clock=()=>1.8;d.update();}''');frames()
        assert state()['carried']and state()['hand'],state();page.screenshot(path=str(Path(out)/'drink-lift.png'))
        before=state();page.keyboard.press('g');page.wait_for_function('document.getElementById("graphics-dialog").open && !document.pointerLockElement');page.evaluate('''()=>{const d=window.__app.drink;d.clock=()=>100;d.update();}''');paused=state();assert paused['time']==before['time']and not paused['audio']and paused['nodes']==0 and not paused['active'],paused
        page.locator('#graphics-done').click();page.locator('#enter').click();page.wait_for_function('!!document.pointerLockElement && window.__app.drink.running');assert not state()['active'],state()
        page.evaluate('''()=>{const d=window.__app.drink;d.update();}''');assert state()['time']==before['time'],state()
        page.evaluate('''()=>{const d=window.__app.drink;d.time=2.7;d.lastTime=2.7;d.clock=()=>2.7;d.update();}''');frames();page.screenshot(path=str(Path(out)/'drink-raised.png'))
        page.evaluate('''()=>{const s=window.__app,d=s.drink;d.time=4.25;d.lastTime=4.25;d.clock=()=>4.25;d.audio.pause();d.audio.resume(d.time);d.update();document.getElementById('grain').style.animation='none';document.getElementById('stats').hidden=true;}''');frames(6)
        sip=state();assert sip['carried']and sip['fill']<.104 and sip['hand']and not sip['active'],sip
        page.screenshot(path=str(Path(out)/'drink-sip.png'));print('Rigged hand, lifted glass, draining level, menu pause and resume PASS',flush=True)
        # Reuse the real visibility listener and update branch while retaining a
        # deterministic clock; this verifies no hidden interval is repaid.
        hidden=page.evaluate('''()=>{const d=window.__app.drink;Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));d.clock=()=>200;d.update();const value={time:d.time,audio:d.audio.playing};delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));d.update();return{...value,after:d.time};}''');assert hidden=={'time':4.25,'audio':False,'after':4.25},hidden
        page.evaluate('''()=>{const d=window.__app.drink;d.time=8.7;d.lastTime=8.7;d.clock=()=>9.01;d.update();}''');done=state();assert not done['running']and done['active']and not done['hand']and done['fill']==.037 and done['parent']=='refrigerator cabinet',done
        assert page.evaluate('window.__app.fridge.hasDrunk && !window.__app.fridge.canDrink() && !window.__app.fridge.drinkRunning')
        page.evaluate('''()=>{const s=window.__app,f=s.fridge,p=s.player,d=f.handle.clone().sub(s.camera.getPosition());p.yaw=Math.atan2(-d.x,-d.z)*180/Math.PI;p.pitch=Math.atan2(d.y,Math.hypot(d.x,d.z))*180/Math.PI;p.apply(0);s.interactions.enabled=true;s.interactions.update();}''')
        page.wait_for_function('window.__app.interactions.focus?.label()==="Close the refrigerator"');page.keyboard.press('e');page.wait_for_function('!window.__app.fridge.openRequested');page.evaluate('''()=>{const f=window.__app.fridge;for(let i=0;i<300&&f.moving;i++)f.update(1/60);}''');assert page.evaluate('window.__app.fridge.angle===0 && !window.__app.fridge.light.light.enabled')
        assert not errors,errors;assert not console,console;assert not bad,bad
        result={'mode':mode,'quality':quality,'nativeSecondE':True,'pauseResume':True,'hiddenFreeze':True,'completed':done,'assets':s,'errors':errors,'consoleErrors':console,'httpErrors':bad,'method':'Native input; deterministic animation stepping for software rendering, not throughput.'};Path(out,'validation.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
    finally:browser.close()
