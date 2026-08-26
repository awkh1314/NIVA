from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / 'src' / 'main.js'
text = path.read_text(encoding='utf-8')
old = """  applyBalance(){
    const b=this.balancePlan;if(!b)return;
    const pitch=b.torsoPitchDeg||0,roll=b.torsoRollDeg||0;
    applyAdditive('hips',pitch*.20,0,-roll*.46,'balance');
    applyAdditive('spine',pitch*.36,0,-roll*.30,'balance');
    applyAdditive('chest',pitch*.28,0,-roll*.18,'balance');
    applyAdditive('upperChest',pitch*.16,0,-roll*.08,'balance');
  },
"""
new = """  applyBalance(){
    if(!settings.physicsEnabled||!settings.physicsGroundContact)return;
    const fullBody=this.balancePlan?.fullBody;if(!fullBody)return;
    for(const [name,p] of Object.entries(fullBody)){
      applyAdditive(name,p?.x||0,p?.y||0,p?.z||0,'balance');
    }
  },
"""
if old not in text:
    raise SystemExit('whole-body balance insertion point not found')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
Path(__file__).unlink()
print('NIVA whole-body stability runtime wired')
