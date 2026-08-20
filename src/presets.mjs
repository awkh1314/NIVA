export const NIVA_PRESETS = Object.freeze([
  { id:'welcome_home', label:'欢迎回归', data:{ performance:'welcome_home', emotion:'happy', voice:['bright',0.58] } },
  { id:'tai_chi_beginner', label:'太极演绎', data:{ performance:'tai_chi_beginner', emotion:'neutral', voice:['gentle',0.42] } },
  { id:'thinking_demo', label:'思考演绎', data:{ performance:'thinking_demo', emotion:'thinking', voice:['serious',0.44] } },
  { id:'greet', label:'打招呼', data:{ text:'你好，我是 NIVA。今天想让我陪你做什么？', emotion:'happy', gestures:[['wave','r',0.72],['nod','c',0.25]], voice:['bright',0.58] } },
  { id:'celebrate', label:'庆祝', data:{ text:'完成了。这个进展值得庆祝一下。', emotion:'happy', gestures:[['cheer','c',0.68],['nod','c',0.28]], voice:['excited',0.60] } },
  { id:'explain', label:'说明', data:{ text:'我会把复杂问题拆成几步，每一步只处理一个明确目标。', emotion:'neutral', gestures:[['openArms','c',0.34],['point','r',0.28]], voice:['warm',0.42] } },
]);
