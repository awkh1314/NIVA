from pathlib import Path

MAIN = Path('src/main.js')
INDEX = Path('index.html')
STYLE = Path('src/style.css')
DOC = Path('docs/LIFE_SYSTEM_V1.md')

main = MAIN.read_text(encoding='utf-8')
index = INDEX.read_text(encoding='utf-8')
style = STYLE.read_text(encoding='utf-8')


def once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'marker missing: {label}')
    return text.replace(old, new, 1)

# ---------- top-left guide + telemetry ----------
index = once(index,
'''        <span class="free-badge">FREE / 基础体验</span>''',
'''        <div class="top-left-tools">
          <span class="free-badge">FREE / 基础体验</span>
          <button id="lifeGuideToggle" class="ghost-btn life-guide-btn">生命系统 · 操作文档</button>
          <span id="lifeVitals" class="life-vitals">心率 68 · 呼吸 12 · 疲劳 0%</span>
        </div>''', 'top-left tools')

index = once(index,
'''    <aside id="controlPanel" class="drawer hidden" aria-hidden="true">''',
'''    <aside id="lifeGuide" class="life-guide hidden" aria-hidden="true">
      <div class="drawer-head">
        <div><b>NIVA 真实生命系统 · V1</b><small>活动 → 负荷 → 疲劳 → 呼吸/心率 → 姿态 → 恢复</small></div>
        <button id="closeLifeGuide" class="icon-btn">×</button>
      </div>
      <div class="life-guide-body">
        <section><h3>怎么体验</h3><p>底部“动作预览”中的走路、跑步、思考、蹲下会持续执行，直到切换或停止。持续跑步会真实累积疲劳：动作逐渐减速、步频出现轻微波动、呼吸和心率升高、身体逐渐前倾；疲劳超过极限后会自动进入撑膝喘息恢复，恢复后若你没有停止“跑步”意图，会继续跑。</p></section>
        <section><h3>生命状态</h3><p>左上角实时显示心率、呼吸频率和疲劳。疲劳不是随机表演，而是由当前活动负荷和持续时间计算；随机只用于疲劳后的轻微步频波动和微表情，让行为不机械。</p></section>
        <section><h3>舞台移动</h3><p>走路/跑步不再只是原地踏步。角色会在舞台安全半径内选择目标点并移动，接近边缘会重新选择舞台内目标，身体朝移动方向转向。</p></section>
        <section><h3>蹲下与脚底固定</h3><p>蹲下不是直接把整个模型向下平移。系统先记录左右脚的世界坐标中心作为“脚底锚点”，再弯曲髋、膝、踝和躯干；每帧根据脚底偏差反向补偿角色根节点，使脚底中心尽量锁在舞台上。这是 V1 的双脚平均锁定。后续升级为左右腿独立 Two-Bone IK，可进一步消除单脚滑动。</p></section>
        <section><h3>疲劳分级</h3><p>0–30 正常；30–55 轻度疲劳；55–75 步频开始波动；75–88 明显疲劳并减速；≥88 自动撑膝喘息约 14 秒。静止、蹲下和恢复动作会降低疲劳。</p></section>
        <section><h3>设计原则</h3><p>生命系统只产生高层状态和动作参数，不直接让语言模型写骨骼角度。舞台移动、脚底约束、姿态动画和表情分别由专门控制层执行，避免“生命逻辑”和“骨骼实现”耦合。</p></section>
      </div>
    </aside>
    <aside id="controlPanel" class="drawer hidden" aria-hidden="true">''', 'life guide panel')

# ---------- JS element refs + settings ----------
main = once(main,
'''const runtimeSummary = $('#runtimeSummary');''',
'''const runtimeSummary = $('#runtimeSummary');
const lifeGuide = $('#lifeGuide');
const lifeGuideToggle = $('#lifeGuideToggle');
const closeLifeGuide = $('#closeLifeGuide');
const lifeVitalsEl = $('#lifeVitals');''', 'life refs')

main = once(main,
'''  allowRun:true,
  exposure:0.9,''',
'''  allowRun:true,
  lifeSimulation:true,
  lifeTimeScale:1,
  autoFatigueRecovery:true,
  exposure:0.9,''', 'life settings')

# ---------- crouch / recovery authored pose clips ----------
main = once(main,
'''  clips.set('thinkLoop',makeClip('thinkLoop',4,{head:[[0,-2,5,-7],[1,-3,6,-8],[2,-2,5,-7],[3,-3,7,-6],[4,-2,5,-7]],rightUpperArm:[[0,8,4,20],[4,8,4,20]],rightLowerArm:[[0,0,48,0],[4,0,48,0]],rightHand:[[0,6,0,-6],[2,8,0,-5],[4,6,0,-6]]}));
}''',
'''  clips.set('thinkLoop',makeClip('thinkLoop',4,{head:[[0,-2,5,-7],[1,-3,6,-8],[2,-2,5,-7],[3,-3,7,-6],[4,-2,5,-7]],rightUpperArm:[[0,8,4,20],[4,8,4,20]],rightLowerArm:[[0,0,48,0],[4,0,48,0]],rightHand:[[0,6,0,-6],[2,8,0,-5],[4,6,0,-6]]}));
  clips.set('crouch',makeClip('crouch',2,{hips:[[0,5,0,0],[2,5,0,0]],spine:[[0,9,0,0],[2,9,0,0]],leftUpperLeg:[[0,30,0,0],[2,30,0,0]],rightUpperLeg:[[0,30,0,0],[2,30,0,0]],leftLowerLeg:[[0,58,0,0],[2,58,0,0]],rightLowerLeg:[[0,58,0,0],[2,58,0,0]],leftFoot:[[0,-24,0,0],[2,-24,0,0]],rightFoot:[[0,-24,0,0],[2,-24,0,0]],head:[[0,-5,0,0],[2,-5,0,0]]}));
  clips.set('recovery',makeClip('recovery',3,{hips:[[0,8,0,0],[3,8,0,0]],spine:[[0,28,0,0],[3,28,0,0]],chest:[[0,12,0,0],[3,12,0,0]],neck:[[0,-10,0,0],[3,-10,0,0]],leftUpperLeg:[[0,22,0,0],[3,22,0,0]],rightUpperLeg:[[0,22,0,0],[3,22,0,0]],leftLowerLeg:[[0,42,0,0],[3,42,0,0]],rightLowerLeg:[[0,42,0,0],[3,42,0,0]],leftFoot:[[0,-17,0,0],[3,-17,0,0]],rightFoot:[[0,-17,0,0],[3,-17,0,0]],leftUpperArm:[[0,18,0,-8],[3,18,0,-8]],rightUpperArm:[[0,18,0,8],[3,18,0,8]],leftLowerArm:[[0,0,-32,0],[3,0,-32,0]],rightLowerArm:[[0,0,32,0],[3,0,32,0]],head:[[0,-8,0,0],[3,-8,0,0]]}));
}''', 'crouch recovery clips')

# ---------- preview layer ----------
main = once(main,
'''const previewActions=[['停止','stop'],['思考','thinkLoop'],['走路','walk'],['跑步','run']];
function startPreviewMotion(name){if(name==='stop'){stopAction();setExpression('neutral',0);return;}stopAction();persistentPreview=name;setTimeout(()=>{if(persistentPreview===name)playClip(name,{loop:true});},190);}''',
'''const previewActions=[['停止','stop'],['思考','thinkLoop'],['走路','walk'],['跑步','run'],['蹲下','crouch']];
function startPreviewMotion(name){
  if(name==='stop'){stopAction();lifeSim.recovering=false;setExpression('neutral',0);return;}
  if(name==='crouch') lifeSim.captureFootAnchor();
  stopAction();persistentPreview=name;lifeSim.onPreviewChanged(name);
  setTimeout(()=>{if(persistentPreview===name)playClip(name,{loop:true});},190);
}''', 'preview layer')

# ---------- real life simulation ----------
life_code = r'''
const lifeSim={
  fatigue:0,energy:100,heartRate:68,breathRate:12,load:0,recovering:false,recoveryUntil:0,
  paceNoise:1,nextPaceNoise:0,lastUi:0,lastPreview:'',stageTarget:new THREE.Vector3(),footAnchor:null,groundMode:'',
  activity(){if(this.recovering)return'recovery';if(persistentPreview)return persistentPreview;if(currentActionName&&currentActionName!=='idle')return currentActionName;return'idle';},
  loadFor(a){return ({run:1,walk:.42,crouch:.24,thinkLoop:.16,think:.16,wave:.2,recovery:.55}[a]||.05);},
  onPreviewChanged(name){this.lastPreview='';if(name==='walk'||name==='run')this.chooseStageTarget();},
  chooseStageTarget(){const a=Math.random()*Math.PI*2,r=.32+Math.random()*.82;this.stageTarget.set(Math.cos(a)*r,0,Math.sin(a)*r);},
  captureFootAnchor(){
    if(!vrm)return;vrm.scene.updateMatrixWorld(true);const ps=['leftFoot','rightFoot'].map(getBone).filter(Boolean).map(b=>b.getWorldPosition(new THREE.Vector3()));if(!ps.length)return;
    this.footAnchor=ps.reduce((s,p)=>s.add(p),new THREE.Vector3()).multiplyScalar(1/ps.length);
  },
  updateLocomotion(dt,a){
    if(!vrm||this.recovering||!['walk','run'].includes(a)||persistentPreview!==a)return;
    const baseX=modelHome.x+settings.modelX,baseZ=modelHome.z+settings.modelZ;
    const pos=new THREE.Vector3(vrm.scene.position.x-baseX,0,vrm.scene.position.z-baseZ),to=this.stageTarget.clone().sub(pos);to.y=0;
    if(to.length()<.14){this.chooseStageTarget();return;}
    const dir=to.normalize(),fatigueSlow=1-clamp((this.fatigue-35)/170,0,.28),speed=(a==='run'?.43:.20)*(settings.lifeTimeScale||1)*fatigueSlow;
    pos.addScaledVector(dir,speed*dt);const maxR=1.18;if(pos.length()>maxR)pos.setLength(maxR);
    vrm.scene.position.x=baseX+pos.x;vrm.scene.position.z=baseZ+pos.z;
    const targetYaw=rad(settings.modelRotY)+Math.atan2(dir.x,dir.z),cur=vrm.scene.rotation.y,diff=Math.atan2(Math.sin(targetYaw-cur),Math.cos(targetYaw-cur));vrm.scene.rotation.y=cur+diff*(1-Math.exp(-dt*7));
  },
  forceRecovery(now){
    if(this.recovering||persistentPreview!=='run')return;this.recovering=true;this.recoveryUntil=now+14000;this.captureFootAnchor();life.deepBreathUntil=now+15000;
    if(currentAction)currentAction.fadeOut(.28);setTimeout(()=>{if(this.recovering&&persistentPreview==='run')playClip('recovery',{loop:true});},80);
  },
  applyGroundContact(dt){
    if(!vrm)return;const mode=['crouch','recovery'].includes(currentActionName);const baseY=modelHome.y+settings.modelY;
    if(!mode){this.groundMode='';this.footAnchor=null;vrm.scene.position.y+=((baseY-vrm.scene.position.y)*(1-Math.exp(-dt*8)));return;}
    if(this.groundMode!==currentActionName){this.groundMode=currentActionName;if(!this.footAnchor)this.captureFootAnchor();}
    if(!this.footAnchor)return;vrm.scene.updateMatrixWorld(true);const ps=['leftFoot','rightFoot'].map(getBone).filter(Boolean).map(b=>b.getWorldPosition(new THREE.Vector3()));if(!ps.length)return;
    const c=ps.reduce((s,p)=>s.add(p),new THREE.Vector3()).multiplyScalar(1/ps.length),err=this.footAnchor.clone().sub(c),w=1-Math.exp(-dt*18);
    vrm.scene.position.x+=err.x*w;vrm.scene.position.z+=err.z*w;vrm.scene.position.y=clamp(vrm.scene.position.y+err.y*w,baseY-.62,baseY+.12);
  },
  applyFatigueFace(){
    if(!vrm?.expressionManager||speaking||activeExpression!=='neutral')return;const tired=clamp((this.fatigue-32)/115,0,.42);if(tired<=0)return;
    try{vrm.expressionManager.setValue('relaxed',tired);}catch{}
  },
  update(dt,now){
    if(!settings.lifeEnabled||!settings.lifeSimulation||!modelReady)return;dt*=settings.lifeTimeScale||1;const a=this.activity(),load=this.loadFor(a);this.load+=(load-this.load)*(1-Math.exp(-dt*2.3));
    const gain=({run:1.62,walk:.30,crouch:.08,thinkLoop:.06,think:.06,recovery:-1.35,idle:-.38}[a]??-.16);this.fatigue=clamp(this.fatigue+gain*dt,0,100);this.energy=clamp(100-this.fatigue*.88,0,100);
    const hrTarget=68+this.load*72+this.fatigue*.12,brTarget=12+this.load*23+this.fatigue*.045;this.heartRate+=(hrTarget-this.heartRate)*(1-Math.exp(-dt/5));this.breathRate+=(brTarget-this.breathRate)*(1-Math.exp(-dt/4));
    if(this.fatigue>55&&now>=this.nextPaceNoise){this.paceNoise=.90+Math.random()*.12;this.nextPaceNoise=now+1500+Math.random()*2400;}else this.paceNoise+=(1-this.paceNoise)*(1-Math.exp(-dt*2));
    if(currentAction){const fatigueSlow=1-clamp((this.fatigue-28)/150,0,.30);currentAction.setEffectiveTimeScale((settings.motionSpeed||1)*fatigueSlow*this.paceNoise);}
    if(this.fatigue>34&&!['crouch','recovery'].includes(currentActionName)){const f=clamp((this.fatigue-34)/66,0,1);applyAdditive('spine',f*4.2,0,0,'fatigue');applyAdditive('chest',f*2.4,0,0,'fatigue');applyAdditive('neck',-f*1.8,0,0,'fatigue');}
    if(settings.autoFatigueRecovery&&a==='run'&&this.fatigue>=88)this.forceRecovery(now);
    if(this.recovering&&now>=this.recoveryUntil){this.recovering=false;this.footAnchor=null;if(persistentPreview==='run')setTimeout(()=>{if(persistentPreview==='run'&&!this.recovering)playClip('run',{loop:true});},120);}
    this.updateLocomotion(dt,a);
    if(lifeVitalsEl&&now-this.lastUi>220){this.lastUi=now;const label=this.recovering?'恢复中':({run:'跑步',walk:'走路',crouch:'蹲下',thinkLoop:'思考'}[a]||'平静');lifeVitalsEl.textContent=`心率 ${Math.round(this.heartRate)} · 呼吸 ${Math.round(this.breathRate)} · 疲劳 ${Math.round(this.fatigue)}% · ${label}`;}
  }
};
'''
main = once(main, '\nconst life={\n', '\n' + life_code + '\nconst life={\n', 'life system insert')

# Make breathing/heartbeat derive from simulated vitals and blinking react to fatigue.
main = once(main,
'''if(t>300){this.blinkStart=0;this.nextBlink=now+3200+Math.random()*2600;if(this.blinkDouble)this.nextBlink=now+180;}''',
'''if(t>300){this.blinkStart=0;const fatigueBlink=settings.lifeSimulation?clamp(3200-lifeSim.fatigue*18,1300,3200):3200;this.nextBlink=now+fatigueBlink+Math.random()*2200;if(this.blinkDouble)this.nextBlink=now+180;}''', 'fatigue blink')
main = once(main,
'''if(settings.breathingEnabled){ const breathHz=settings.breaths/60; const amp=(now<this.deepBreathUntil?.valueOf()?settings.breathAmp*1.8:settings.breathAmp);''',
'''if(settings.breathingEnabled){ const breathHz=(settings.lifeSimulation?lifeSim.breathRate:settings.breaths)/60; const baseAmp=settings.breathAmp*(settings.lifeSimulation?(1+lifeSim.fatigue/115):1); const amp=(now<this.deepBreathUntil?.valueOf()?baseAmp*1.8:baseAmp);''', 'dynamic breath')
main = once(main,
'''const beatPhase=((now/1000)*(settings.bpm/60))%1;''',
'''const beatPhase=((now/1000)*((settings.lifeSimulation?lifeSim.heartRate:settings.bpm)/60))%1;''', 'dynamic heart')

# Generic additive layers so fatigue can coexist with breath/heartbeat/manual pose.
main = once(main,
'''  if(!additiveScratch.has(name)) additiveScratch.set(name,{life:[0,0,0],heartbeat:[0,0,0]}); const s=additiveScratch.get(name); s[key]=[x,y,z];''',
'''  if(!additiveScratch.has(name)) additiveScratch.set(name,{}); const s=additiveScratch.get(name); s[key]=[x,y,z];''', 'generic additive init')
main = once(main,
'''    const node=getBone(name); if(!node)continue; const m=manualOffsets.get(name)||[0,0,0]; const s=additiveScratch.get(name)||{life:[0,0,0],heartbeat:[0,0,0]}; const lx=(s.life?.[0]||0)+(s.heartbeat?.[0]||0),ly=(s.life?.[1]||0),lz=(s.life?.[2]||0);
    node.quaternion.copy(base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(m[0]+lx),rad(m[1]+ly),rad(m[2]+lz),'XYZ')));''',
'''    const node=getBone(name); if(!node)continue; const m=manualOffsets.get(name)||[0,0,0],layers=additiveScratch.get(name)||{};let lx=0,ly=0,lz=0;for(const v of Object.values(layers)){lx+=v?.[0]||0;ly+=v?.[1]||0;lz+=v?.[2]||0;}
    node.quaternion.copy(base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(m[0]+lx),rad(m[1]+ly),rad(m[2]+lz),'XYZ')));''', 'generic additive sum')

# Extend Life controls with simulation controls.
main = once(main,
'''function renderLifeControls(){
  controlPage.innerHTML=`<section class="panel-section"><h3>生命系统</h3>${toggleHtml('自然行为系统','lifeEnabled')}${toggleHtml('跟随鼠标','mouseGaze')}${toggleHtml('允许摸鼠标','allowReach')}${toggleHtml('允许走路','allowWalk')}${toggleHtml('允许跑步','allowRun')}${rowSlider('心率 BPM',45,120,1,settings.bpm)}${rowSlider('呼吸 / min',6,24,1,settings.breaths)}${rowSlider('呼吸幅度',0,.8,.05,settings.breathAmp)}${rowSlider('微动作频率',0,1,.05,settings.microFreq)}${rowSlider('大动作频率',0,1,.05,settings.majorFreq)}</section>`;bindToggles();const ins=controlPage.querySelectorAll('input[type=range]');const keys=['bpm','breaths','breathAmp','microFreq','majorFreq'];ins.forEach((el,i)=>{el.oninput=()=>{settings[keys[i]]=Number(el.value);el.parentElement.querySelector('output').textContent=el.value;saveSettings();};});
}''',
'''function renderLifeControls(){
  controlPage.innerHTML=`<section class="panel-section"><h3>真实生命系统</h3>${toggleHtml('生命模拟','lifeSimulation')}${toggleHtml('极限疲劳自动恢复','autoFatigueRecovery')}${rowSlider('生命时间倍率',.25,3,.05,settings.lifeTimeScale)}<div class="life-readout">实时：心率 <b>${Math.round(lifeSim.heartRate)}</b> · 呼吸 <b>${Math.round(lifeSim.breathRate)}</b> · 疲劳 <b>${Math.round(lifeSim.fatigue)}%</b> · 能量 <b>${Math.round(lifeSim.energy)}%</b></div></section><section class="panel-section"><h3>基础生命参数</h3>${toggleHtml('自然行为系统','lifeEnabled')}${toggleHtml('跟随鼠标','mouseGaze')}${toggleHtml('允许摸鼠标','allowReach')}${toggleHtml('允许走路','allowWalk')}${toggleHtml('允许跑步','allowRun')}${rowSlider('基础心率 BPM',45,120,1,settings.bpm)}${rowSlider('基础呼吸 / min',6,24,1,settings.breaths)}${rowSlider('呼吸幅度',0,.8,.05,settings.breathAmp)}${rowSlider('微动作频率',0,1,.05,settings.microFreq)}${rowSlider('大动作频率',0,1,.05,settings.majorFreq)}</section>`;bindToggles();const ins=controlPage.querySelectorAll('input[type=range]');const keys=['lifeTimeScale','bpm','breaths','breathAmp','microFreq','majorFreq'];ins.forEach((el,i)=>{el.oninput=()=>{settings[keys[i]]=Number(el.value);el.parentElement.querySelector('output').textContent=el.value;saveSettings();};});
}''', 'life controls')

# Add crouch to control action preview.
main = once(main,
'''<button data-preview="run">跑步</button></div>${rowSlider('动作速度' ''',
'''<button data-preview="run">跑步</button><button data-preview="crouch">蹲下</button></div>${rowSlider('动作速度' ''', 'motion control crouch')

# Guide handlers near existing panel handlers.
main = once(main,
'''$('#panelToggle').onclick=()=>{panel.classList.toggle('hidden');upgradePanel.classList.add('hidden');settings.panelVisible=!panel.classList.contains('hidden');saveSettings();renderControl();};''',
'''lifeGuideToggle.onclick=()=>{lifeGuide.classList.toggle('hidden');panel.classList.add('hidden');upgradePanel.classList.add('hidden');};closeLifeGuide.onclick=()=>lifeGuide.classList.add('hidden');
$('#panelToggle').onclick=()=>{panel.classList.toggle('hidden');lifeGuide.classList.add('hidden');upgradePanel.classList.add('hidden');settings.panelVisible=!panel.classList.contains('hidden');saveSettings();renderControl();};''', 'guide handlers')

# Animate integration: physiology before visual life; fatigue face after expression; foot lock after VRM update.
main = once(main,
'''requestAnimationFrame(animate); const dt=Math.min(clock.getDelta(),.05),now=performance.now(); controls.update(); if(mixer)mixer.update(dt); life.update(now); director.update(now); updateGaze(now); expressionTick(now);''',
'''requestAnimationFrame(animate); const dt=Math.min(clock.getDelta(),.05),now=performance.now(); controls.update(); if(mixer)mixer.update(dt); lifeSim.update(dt,now); life.update(now); director.update(now); updateGaze(now); expressionTick(now); lifeSim.applyFatigueFace();''', 'animate life sim')
main = once(main,
'''applyManualAndLife(); if(vrm)vrm.update(dt); renderer.render(scene,camera);''',
'''applyManualAndLife(); if(vrm){vrm.update(dt);lifeSim.applyGroundContact(dt);} renderer.render(scene,camera);''', 'ground contact hook')

# Expose vitals for debugging/automation.
main = once(main,
'''state:()=>({modelReady,speaking,currentAction:currentActionName,director:director.state})''',
'''state:()=>({modelReady,speaking,currentAction:currentActionName,director:director.state,life:{fatigue:lifeSim.fatigue,energy:lifeSim.energy,heartRate:lifeSim.heartRate,breathRate:lifeSim.breathRate,recovering:lifeSim.recovering}})''', 'window state vitals')

# ---------- styles ----------
style += r'''
.top-left-tools{display:flex;align-items:center;gap:8px;pointer-events:auto;max-width:70vw}.life-guide-btn{padding:7px 10px}.life-vitals{border:1px solid #244b4f;border-radius:999px;padding:6px 10px;background:#07181bcc;color:#a6d9d7;font-size:12px;white-space:nowrap;backdrop-filter:blur(12px)}.life-guide{position:fixed;left:12px;top:68px;bottom:78px;width:min(520px,calc(100vw - 24px));background:#08131aee;border:1px solid #285063;border-radius:18px;z-index:13;box-shadow:0 20px 70px #000a;backdrop-filter:blur(18px);display:flex;flex-direction:column;overflow:hidden;transition:.2s ease}.life-guide.hidden{opacity:0;pointer-events:none;transform:translateX(-24px)}.life-guide-body{padding:12px 14px 20px;overflow:auto}.life-guide-body section{padding:11px 12px;margin-bottom:9px;border:1px solid #17394a;border-radius:12px;background:#0a1720}.life-guide-body h3{margin:0 0 6px;color:#83ece9;font-size:14px}.life-guide-body p{margin:0;color:#b9ced5;line-height:1.65;font-size:13px}.life-readout{padding:10px;border-radius:10px;background:#0c2028;border:1px solid #24505b;color:#a9cbd1;line-height:1.6}.life-readout b{color:#e9ffff}@media(max-width:900px){.life-vitals{display:none}.top-left-tools{max-width:62vw}.life-guide{top:60px;bottom:72px}}
'''

DOC.parent.mkdir(parents=True, exist_ok=True)
DOC.write_text('''# NIVA 真实生命系统 V1\n\n## 目标\n把“动作播放器”升级为持续状态驱动的数字生命：活动会产生负荷，负荷累积成疲劳，疲劳继续影响呼吸、心率、表情、姿态、动作速度和恢复行为。\n\n## 状态链\n`activity -> load -> fatigue/energy -> heart/breath -> motion/face -> recovery`\n\n## V1 行为\n- 跑步：持续增加疲劳，心率和呼吸上升；中高疲劳后速度下降并出现受限随机步频波动。\n- 走路：真实在舞台安全半径内移动，不只是原地踏步。\n- 极限疲劳：跑步疲劳达到 88% 时自动进入约 14 秒撑膝喘息；如果用户没有停止跑步意图，恢复后继续跑。\n- 蹲下：使用脚底锚点 + 根节点补偿实现 V1 双脚平均锁定，尽量防止脚穿透/离开舞台。\n- 呼吸/心率：由当前活动负荷与疲劳平滑驱动。\n- 表情/姿态：疲劳提高时增加放松/疲惫脸、眨眼频率、躯干轻微前倾。\n\n## 脚底约束\nV1 在进入蹲下或恢复姿态前记录左右脚世界坐标中心；姿态动画弯曲髋/膝/踝后，每帧计算脚底中心偏差并反向补偿 VRM 根节点 XYZ，使双脚平均中心保持在原舞台锚点。\n\n这不是最终 IK。V2 应升级为左右腿独立 Two-Bone IK，并增加足底法线、脚尖/脚跟接触相位与手臂到膝盖的 IK。\n\n## 安全原则\n语言模型只能选择高层行为/意图，不能直接输出骨骼旋转、根节点坐标或物理参数。\n''', encoding='utf-8')

MAIN.write_text(main, encoding='utf-8')
INDEX.write_text(index, encoding='utf-8')
STYLE.write_text(style, encoding='utf-8')
print('life system v1 patch applied')
