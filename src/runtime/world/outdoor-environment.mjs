import * as THREE from 'three';
import { DayNightCycle } from './day-night-cycle.mjs';

function rngFactory(seed=1337){let s=seed>>>0;return()=>((s=(s*1664525+1013904223)>>>0)/4294967296);}

function makeSkyMaterial(){
  return new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{topColor:{value:new THREE.Color(0x387fc0)},horizonColor:{value:new THREE.Color(0xbfddeb)},groundColor:{value:new THREE.Color(0x76967f)}},vertexShader:`varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`uniform vec3 topColor;uniform vec3 horizonColor;uniform vec3 groundColor;varying vec3 vDir;void main(){float h=clamp(vDir.y*.5+.5,0.,1.);float sky=smoothstep(.42,.78,h);vec3 c=mix(horizonColor,topColor,sky);float below=1.-smoothstep(.36,.48,h);c=mix(c,groundColor,below*.42);gl_FragColor=vec4(c,1.);}`});
}

function makeTree(r,x,z,scale=1){
  const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.09,.13,1.15,7),new THREE.MeshStandardMaterial({color:0x6f533b,roughness:.96}));trunk.position.y=.57;trunk.castShadow=true;g.add(trunk);
  const crownMat=new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(.28+r()*.035,.36,.30+r()*.06),roughness:.98});
  for(const [ox,oy,oz,s] of [[0,1.35,0,.62],[-.28,1.22,.05,.42],[.28,1.20,-.08,.46],[.04,1.63,.03,.40]]){const c=new THREE.Mesh(new THREE.IcosahedronGeometry(s,1),crownMat);c.position.set(ox,oy,oz);c.castShadow=true;g.add(c);}return g;
}

export class OutdoorEnvironment{
  constructor({scene,timeOfDay=.30,auto=true,dayDurationSeconds=720}={}){
    this.scene=scene;this.group=new THREE.Group();this.group.name='NIVA_OutdoorWorld';scene.add(this.group);this.dayNight=new DayNightCycle({timeOfDay,auto,dayDurationSeconds});this.rng=rngFactory();this.grassCount=0;this.build();this.update(0);
  }
  build(){
    const grassGround=new THREE.Mesh(new THREE.PlaneGeometry(44,44,1,1),new THREE.MeshStandardMaterial({color:0x719565,roughness:1,metalness:0}));grassGround.rotation.x=-Math.PI/2;grassGround.position.y=-.055;grassGround.receiveShadow=true;grassGround.name='grassGround';this.group.add(grassGround);this.grassGround=grassGround;
    const bladeGeo=new THREE.PlaneGeometry(.045,.34,1,2);bladeGeo.translate(0,.17,0);const bladeMat=new THREE.MeshStandardMaterial({color:0x638a57,roughness:1,side:THREE.DoubleSide});
    const count=1150,grass=new THREE.InstancedMesh(bladeGeo,bladeMat,count);grass.name='grassInstances';grass.castShadow=false;grass.receiveShadow=false;const m=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3(),p=new THREE.Vector3();
    let placed=0;for(let i=0;i<count*3&&placed<count;i++){
      const x=(this.rng()-.5)*40,z=(this.rng()-.42)*40;if(Math.abs(x)<3.35&&z>-2.8&&z<2.8)continue;
      p.set(x,-.045,z);q.setFromAxisAngle(new THREE.Vector3(0,1,0),this.rng()*Math.PI);const k=.55+this.rng()*.9;s.set(k,.65+this.rng()*.9,k);m.compose(p,q,s);grass.setMatrixAt(placed++,m);
    }grass.count=placed;grass.instanceMatrix.needsUpdate=true;this.grassCount=placed;this.group.add(grass);this.grass=grass;
    const hillMat=new THREE.MeshStandardMaterial({color:0x587a52,roughness:1});for(let i=0;i<9;i++){const a=i/9*Math.PI*2,rad=14+this.rng()*5;const hill=new THREE.Mesh(new THREE.SphereGeometry(2.5+this.rng()*2,16,8),hillMat);hill.scale.set(1.8+this.rng()*1.5,.45+this.rng()*.32,1.2+this.rng());hill.position.set(Math.cos(a)*rad,-1.4,Math.sin(a)*rad+3);hill.receiveShadow=true;this.group.add(hill);}
    for(let i=0;i<18;i++){const a=this.rng()*Math.PI*2,rad=8+this.rng()*11,x=Math.cos(a)*rad,z=Math.sin(a)*rad+3;if(Math.abs(x)<4&&z>-3&&z<4)continue;this.group.add(makeTree(this.rng,x,z,.75+this.rng()*.65));}
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(46,32,18),makeSkyMaterial());this.sky.name='proceduralSkyDome';this.group.add(this.sky);
    this.sun=new THREE.Mesh(new THREE.SphereGeometry(.55,20,12),new THREE.MeshBasicMaterial({color:0xffe3a5,fog:false}));this.sun.name='sun';this.group.add(this.sun);
    this.moon=new THREE.Mesh(new THREE.SphereGeometry(.40,20,12),new THREE.MeshBasicMaterial({color:0xc9d8ff,fog:false}));this.moon.name='moon';this.group.add(this.moon);
    const starPos=[];for(let i=0;i<320;i++){const y=.12+this.rng()*.84,a=this.rng()*Math.PI*2,r=Math.sqrt(Math.max(.01,1-y*y))*42;starPos.push(Math.cos(a)*r,y*42,Math.sin(a)*r);}
    const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(starPos,3));this.starMaterial=new THREE.PointsMaterial({color:0xe7ecff,size:.075,sizeAttenuation:true,transparent:true,opacity:0,depthWrite:false,fog:false});this.stars=new THREE.Points(sg,this.starMaterial);this.stars.name='nightStars';this.group.add(this.stars);
    this.hemi=new THREE.HemisphereLight(0xbfe1ff,0x59684f,.55);this.group.add(this.hemi);
    this.sunLight=new THREE.DirectionalLight(0xffe8cf,1.15);this.sunLight.name='sunLight';this.sunLight.castShadow=true;this.sunLight.shadow.mapSize.set(1024,1024);this.sunLight.shadow.camera.left=-8;this.sunLight.shadow.camera.right=8;this.sunLight.shadow.camera.top=8;this.sunLight.shadow.camera.bottom=-8;this.sunLight.shadow.camera.near=.2;this.sunLight.shadow.camera.far=42;this.group.add(this.sunLight);
    this.moonLight=new THREE.DirectionalLight(0xaac6ff,.18);this.moonLight.name='moonLight';this.group.add(this.moonLight);
    if(this.scene)this.scene.fog=new THREE.FogExp2(0xb6cbd0,.018);
  }
  setTimeOfDay(value){this.dayNight.setTimeOfDay(value);return this.update(0);}
  setSpeed(value){return this.dayNight.setSpeed(value);}
  pause(){this.dayNight.pause();}
  resume(){this.dayNight.resume();}
  update(dt){
    const s=this.dayNight.update(dt);this.sky.material.uniforms.topColor.value.copy(s.topColor);this.sky.material.uniforms.horizonColor.value.copy(s.horizonColor);this.sky.material.uniforms.groundColor.value.copy(s.groundColor);
    this.sun.position.copy(s.sunPosition);this.moon.position.copy(s.moonPosition);this.sun.visible=s.sunY>-.12;this.moon.visible=s.sunY<.30;this.starMaterial.opacity=s.starOpacity;this.stars.visible=s.starOpacity>.01;
    this.sunLight.position.copy(s.sunPosition);this.sunLight.intensity=s.sunIntensity;this.sunLight.color.copy(s.sunColor);this.moonLight.position.copy(s.moonPosition);this.moonLight.intensity=s.moonIntensity;this.moonLight.color.copy(s.moonColor);this.hemi.intensity=s.ambientIntensity;this.hemi.color.copy(s.horizonColor);this.hemi.groundColor.copy(s.groundColor);
    this.grassGround.material.color.set(0x24392e).lerp(new THREE.Color(0x719565),s.dayFactor);if(this.scene?.fog?.color)this.scene.fog.color.copy(s.horizonColor).multiplyScalar(.92);return s;
  }
  state(){const d=this.dayNight.state();return {world:'outdoor-v2',grass:true,grassInstances:this.grassCount,sky:true,sun:true,moon:true,stars:true,walkableSize:{x:44,z:44},...d};}
}
