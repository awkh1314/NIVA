from pathlib import Path

p=Path('src/main.js')
s=p.read_text(encoding='utf-8')
repls=[
("import { PhysiologyOscillator } from './runtime/physics/biomechanics-life.mjs';\n", "import { PhysiologyOscillator } from './runtime/physics/biomechanics-life.mjs';\nimport { JointRotationGuard } from './runtime/safety/joint-rotation-guard.mjs';\n"),
("let ikSystem = null;\n", "let ikSystem = null;\nlet jointGuard = null;\n"),
("ikSystem=new NivaIKSystem({vrm,getBone,frame:characterFrame,modelHeight}); coordinateDebug=", "ikSystem=new NivaIKSystem({vrm,getBone,frame:characterFrame,modelHeight}); jointGuard=new JointRotationGuard({getBone,baseQuats});jointGuard.reset(); coordinateDebug="),
("if(ikSystem&&contactPlan){ikSystem.configure({enabled:true,footEnabled:settings.footIKEnabled,actionEnabled:true,strength:settings.footIKStrength});ikSystem.solve(contactPlan);}facingController?.tick();coordinateDebug?.update();vrm.update(dt);", "if(ikSystem&&contactPlan){ikSystem.configure({enabled:true,footEnabled:settings.footIKEnabled,actionEnabled:true,strength:settings.footIKStrength});ikSystem.solve(contactPlan);}jointGuard?.apply(dt);facingController?.tick();coordinateDebug?.update();vrm.update(dt);")
]
for old,new in repls:
    if old not in s:
        raise SystemExit(f'patch anchor missing: {old[:100]!r}')
    s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('NIVA final joint rotation guard wired')
