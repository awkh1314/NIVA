/* NIVA behavior runtime
 * Independent behavior layer. Attach with NIVABehavior.attach().
 */
(function(){
  const states=['thinking','smile','lookAround','shy','wave'];
  const Behavior={
    timer:null,
    attach(root=document){
      const avatar=root.querySelector('#avatar');
      if(!avatar) return;
      avatar.dataset.emotion='thinking';
      avatar.classList.add('motion-tilt');
      this.timer=setInterval(()=>this.idle(avatar),12000);
    },
    idle(avatar){
      const s=states[Math.floor(Math.random()*states.length)];
      avatar.dataset.emotion=s==='thinking'?'thinking':s;
      avatar.classList.remove('motion-wave','motion-tilt','motion-look');
      if(s==='wave') avatar.classList.add('motion-wave');
      if(s==='lookAround') avatar.classList.add('motion-look');
      if(s==='thinking') avatar.classList.add('motion-tilt');
    }
  };
  window.NIVABehavior=Behavior;
})();
