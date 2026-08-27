import * as THREE from 'three';
import { CozyBedroomV2 } from './cozy-bedroom-v2.mjs';
import { OutdoorEnvironment } from './outdoor-environment.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));
const lerp=(a,b,t)=>a+(b-a)*clamp(t,0,1);

class BlanketCloth{
  constructor({scene,center=new THREE.Vector3(1.55,.67,-.72),width=1.18,length=1.58}={}){
    this.cols=12;this.rows=16;this.width=width;this.length=length;this.center=center.clone();this.gravity=-2.7;this.damping=.985;this.floorY=.615;this.positions=[];this.previous=[];this.restX=width/(this.cols-1);this.restZ=length/(this.rows-1);this.mode='rest';this.progress=0;
    const verts=[],indices=[];for(let r=0;r<this.rows;r++)for(let c=0;c<this.cols;c++){const x=center.x-width/2+c*this.restX,z=center.z-length/2+r*this.restZ,y=center.y+Math.sin(r*.35)*.008;this.positions.push(new THREE.Vector3(x,y,z));this.previous.push(new THREE.Vector3(x,y,z));verts.push(x,y,z);}
    for(let r=0;r<this.rows-1;r++)for(let c=0;c<this.cols-1;c++){const a=r*this.cols+c,b=a+1,d=(r+1)*this.cols+c,e=d+1;indices.push(a,d,b,b,d,e);}this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));this.geometry.setIndex(indices);this.geometry.computeVertexNormals();this.mesh=new THREE.Mesh(this.geometry,new THREE.MeshStandardMaterial({color:0xb8c7b4,roughness:.96,side:THREE.DoubleSide}));this.mesh.castShadow=true;this.mesh.receiveShadow=true;scene.add(this.mesh);
  }
  idx(r,c){return r*this.cols+c;}
  setInteraction(mode,progress=0){this.mode=mode;this.progress=clamp(progress,0,1);}
  pinTargets(){const p=this.progress,targets=new Map();if(this.mode==='open'){const shift=-this.width*.72*p,lift=.20*Math.sin(Math.PI*p);for(const c of [0,1,2]){const i=this.idx(0,c),base=this.center.x-this.width/2+c*this.restX;targets.set(i,new THREE.Vector3(base+shift,this.center.y+lift,this.center.z-this.length/2-.06*p));}}else if(this.mode==='cover'){const row=0,z=lerp(this.center.z-this.length/2,this.center.z+this.length*.18,p),y=this.center.y+.18*Math.sin(Math.PI*p);for(let c=0;c<this.cols;c+=2){const x=this.center.x-this.width/2+c*this.restX;targets.set(this.idx(row,c),new THREE.Vector3(x,y,z));}}return targets;}
  satisfy(a,b,rest,stiff=.72){const pa=this.positions[a],pb=this.positions[b],dx=pb.x-pa.x,dy=pb.y-pa.y,dz=pb.z-pa.z,dist=Math.hypot(dx,dy,dz)||1e-6,k=((dist-rest)/dist)*.5*stiff,ox=dx*k,oy=dy*k,oz=dz*k;pa.x+=ox;pa.y+=oy;pa.z+=oz;pb.x-=ox;pb.y-=oy;pb.z-=oz;}
  update(dt){const h=clamp(dt,1/120,1/30),pins=this.pinTargets();for(let i=0;i<this.positions.length;i++){if(pins.has(i)){this.positions[i].copy(pins.get(i));this.previous[i].copy(pins.get(i));continue;}const p=this.positions[i],q=this.previous[i],vx=(p.x-q.x)*this.damping,vy=(p.y-q.y)*this.damping,vz=(p.z-q.z)*this.damping;q.copy(p);p.x+=vx;p.y+=vy+this.gravity*h*h;p.z+=vz;if(p.y<this.floorY)p.y=this.floorY;}for(let iter=0;iter<5;iter++){for(let r=0;r<this.rows;r++)for(let c=0;c<this.cols;c++){const i=this.idx(r,c);if(c+1<this.cols)this.satisfy(i,this.idx(r,c+1),this.restX);if(r+1<this.rows)this.satisfy(i,this.idx(r+1,c),this.restZ);if(c+1<this.cols&&r+1<this.rows)this.satisfy(i,this.idx(r+1,c+1),Math.hypot(this.restX,this.restZ),.42);}for(const [i,t] of pins)this.positions[i].copy(t);}const arr=this.geometry.attributes.position.array;for(let i=0;i<this.positions.length;i++){const p=this.positions[i];arr[i*3]=p.x;arr[i*3+1]=p.y;arr[i*3+2]=p.z;}this.geometry.attributes.position.needsUpdate=true;this.geometry.computeVertexNormals();}
}

export class BedroomWorld{
  constructor({scene,timeOfDay=.30,autoDayNight=true,dayDurationSeconds=720}={}){this.scene=scene;this.room=new CozyBedroomV2({scene});this.outdoor=new OutdoorEnvironment({scene,timeOfDay,auto:autoDayNight,dayDurationSeconds});this.group=this.room.group;this.colliders=this.room.colliders;this.anchors=this.room.anchors;this.blanket=new BlanketCloth({scene:this.room.group,center:new THREE.Vector3(1.55,.68,-.68)});}
  registerPhysics(bodyPhysics){if(bodyPhysics?.rebuildGroundBox)bodyPhysics.rebuildGroundBox(44,44);else bodyPhysics?.rebuildGround?.(28);for(const c of this.colliders)bodyPhysics?.addFixedBoxCollider?.({name:c.name,size:c.size,position:c.position});}
  anchor(name){return this.room.anchor(name);}
  setBlanket(mode,progress){this.blanket.setInteraction(mode,progress);}
  setTimeOfDay(value){return this.outdoor.setTimeOfDay(value);}
  setDayNightSpeed(value){return this.outdoor.setSpeed(value);}
  pauseDayNight(){this.outdoor.pause();}
  resumeDayNight(){this.outdoor.resume();}
  update(dt){this.blanket.update(dt);this.outdoor.update(dt);}
  state(){return {room:this.room.state(),outdoor:this.outdoor.state(),colliders:this.colliders.length,anchors:Object.keys(this.anchors),blanket:this.blanket.mode};}
}
