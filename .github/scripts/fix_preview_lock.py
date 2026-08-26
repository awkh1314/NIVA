from pathlib import Path
p=Path('src/main.js')
s=p.read_text(encoding='utf-8')
s=s.replace("let currentActionName = 'idle';\n", "let currentActionName = 'idle';\nlet persistentPreview = '';\n", 1)
s=s.replace("function stopAction(){ if(currentAction){", "function stopAction(){ persistentPreview=''; if(currentAction){", 1)
old="function startPreviewMotion(name){if(name==='stop'){stopAction();setExpression('neutral',0);return;}stopAction();setTimeout(()=>playClip(name,{loop:true}),190);}"
new="function startPreviewMotion(name){if(name==='stop'){stopAction();setExpression('neutral',0);return;}stopAction();persistentPreview=name;setTimeout(()=>{if(persistentPreview===name)playClip(name,{loop:true});},190);}"
if old not in s: raise SystemExit('preview marker missing')
s=s.replace(old,new,1)
old2="if(!settings.lifeEnabled||!modelReady||speaking||now<manualOverrideUntil||now<this.resumeAt)return;"
new2="if(!settings.lifeEnabled||!modelReady||speaking||currentAction||persistentPreview||now<manualOverrideUntil||now<this.resumeAt)return;"
if old2 not in s: raise SystemExit('director guard marker missing')
s=s.replace(old2,new2,1)
s=s.replace("state:()=>({modelReady,speaking,currentAction:currentActionName,director:director.state})", "state:()=>({modelReady,speaking,currentAction:currentActionName,persistentPreview,director:director.state})", 1)
p.write_text(s,encoding='utf-8')
