import * as THREE from 'three';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));
const lerp=(a,b,t)=>a+(b-a)*clamp(t,0,1);

function boxMesh(size,pos,color,roughness=.82){
  const m=new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y,size.z),new THREE.MeshStandardMaterial({color,roughness,metalness:.02}));
  m.position.copy(pos);m.castShadow=true;m.receiveShadow=true;return m;
}

class BlanketCloth{
  constructor({scene,center=new THREE.Vector3(1.55,.67,-.72),width=1.18,length=1.58}={}){
    this.cols=12;this.rows=16;this.width=width;this.length=length;this.center=center.clone();this.gravity=-2.7;this.damping=.985;this.floorY=.615;
    this.positions=[];this.previous=[];this.restX=width/(this.cols-1);this.restZ=length/(this.rows-1);this.mode='rest';this.progress=0;
    const verts=[];const indices=[];
    for(let r=0;r<this.rows;r++)for(let c=0;c<this.cols;c++){
      const x=center.x-width/2+c*this.restX,z=center.z-length/2+r*this.restZ,y=center.y+Math.sin(r*.35)*.008;
      this.positions.push(new THREE.Vector3(x,y,z));this.previous.push(new THREE.Vector3(x,y,z));verts.push(x,y,z);
    }
    for(let r=0;r<this.rows-1;r++)for(let c=0;c<this.cols-1;c++){
      const a=r*this.cols+c,b=a+1,d=(r+1)*this.cols+c,e=d+1;indices.push(a,d,b,b,d,e);
    }
    this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));this.geometry.setIndex(indices);this.geometry.computeVertexNormals();
    this.mesh=new THREE.Mesh(this.geometry,new THREE.MeshStandardMaterial({color:0xa9bfd2,roughness:.94,side:THREE.DoubleSide}));this.mesh.castShadow=true;this.mesh.receiveShadow=true;scene.add(this.mesh);
  }
  idx(r,c){return r*this.cols+c;}
  setInteraction(mode,progress=0){this.mode=mode;this.progress=clamp(progress,0,1);}
  pinTargets(){
    const p=this.progress,targets=new Map();
    if(this.mode==='open'){
      const shift=-this.width*.72*p,lift=.20*Math.sin(Math.PI*p);
      for(const c of [0,1,2]){const i=this.idx(0,c);const base=this.center.x-this.width/2+c*this.restX;targets.set(i,new THREE.Vector3(base+shift,this.center.y+lift,this.center.z-this.length/2-.06*p));}
    }else if(this.mode==='cover'){
      const row=0,z=lerp(this.center.z-this.length/2,this.center.z+this.length*.18,p),y=this.center.y+.18*Math.sin(Math.PI*p);
      for(let c=0;c<this.cols;c+=2){const x=this.center.x-this.width/2+c*this.restX;targets.set(this.idx(row,c),new THREE.Vector3(x,y,z));}
    }
    return targets;
  }
  satisfy(a,b,rest,stiff=.72){
    const pa=this.positions[a],pb=this.positions[b],dx=pb.x-pa.x,dy=pb.y-pa.y,dz=pb.z-pa.z,dist=Math.hypot(dx,dy,dz)||1e-6;
    const k=((dist-rest)/dist)*.5*stiff,ox=dx*k,oy=dy*k,oz=dz*k;pa.x+=ox;pa.y+=oy;pa.z+=oz;pb.x-=ox;pb.y-=oy;pb.z-=oz;
  }
  update(dt){
    const h=clamp(dt,1/120,1/30),pins=this.pinTargets();
    for(let i=0;i<this.positions.length;i++){
      if(pins.has(i)){this.positions[i].copy(pins.get(i));this.previous[i].copy(pins.get(i));continue;}
      const p=this.positions[i],q=this.previous[i],vx=(p.x-q.x)*this.damping,vy=(p.y-q.y)*this.damping,vz=(p.z-q.z)*this.damping;q.copy(p);p.x+=vx;p.y+=vy+this.gravity*h*h;p.z+=vz;if(p.y<this.floorY)p.y=this.floorY;
    }
    for(let iter=0;iter<5;iter++){
      for(let r=0;r<this.rows;r++)for(let c=0;c<this.cols;c++){
        const i=this.idx(r,c);if(c+1<this.cols)this.satisfy(i,this.idx(r,c+1),this.restX);if(r+1<this.rows)this.satisfy(i,this.idx(r+1,c),this.restZ);if(c+1<this.cols&&r+1<this.rows)this.satisfy(i,this.idx(r+1,c+1),Math.hypot(this.restX,this.restZ),.42);
      }
      for(const [i,t] of pins)this.positions[i].copy(t);
    }
    const arr=this.geometry.attributes.position.array;for(let i=0;i<this.positions.length;i++){const p=this.positions[i];arr[i*3]=p.x;arr[i*3+1]=p.y;arr[i*3+2]=p.z;}this.geometry.attributes.position.needsUpdate=true;this.geometry.computeVertexNormals();
  }
}

export class BedroomWorld{
  constructor({scene}={}){
    this.scene=scene;this.group=new THREE.Group();this.group.name='NIVA_Bedroom';scene.add(this.group);this.colliders=[];this.anchors={};this.build();
  }
  addBox(name,size,pos,color,collider=true){const m=boxMesh(size,pos,color);m.name=name;this.group.add(m);if(collider)this.colliders.push({name,size:size.clone(),position:pos.clone()});return m;}
  build(){
    this.addBox('roomFloor',new THREE.Vector3(6,.08,5),new THREE.Vector3(0,-.04,0),0x293038,false);
    this.addBox('wallBack',new THREE.Vector3(6,2.8,.10),new THREE.Vector3(0,1.4,-2.5),0x41474d,true);
    this.addBox('wallLeft',new THREE.Vector3(.10,2.8,5),new THREE.Vector3(-3,1.4,0),0x3b4248,true);
    this.addBox('wallRight',new THREE.Vector3(.10,2.8,5),new THREE.Vector3(3,1.4,0),0x3b4248,true);
    const bedCenter=new THREE.Vector3(1.55,.28,-.72);
    this.addBox('bedFrame',new THREE.Vector3(1.48,.32,2.02),bedCenter,0x54463f,true);
    this.addBox('mattress',new THREE.Vector3(1.38,.22,1.92),new THREE.Vector3(1.55,.49,-.72),0xe4e0d9,true);
    this.addBox('pillow',new THREE.Vector3(.86,.16,.42),new THREE.Vector3(1.55,.68,-1.38),0xf2eee7,false);
    this.addBox('bedsideTable',new THREE.Vector3(.58,.62,.58),new THREE.Vector3(2.45,.31,-1.34),0x6d5a4c,true);
    this.addBox('chairSeat',new THREE.Vector3(.65,.12,.62),new THREE.Vector3(-1.55,.52,-.9),0x705e50,true);
    this.addBox('chairBack',new THREE.Vector3(.65,.85,.10),new THREE.Vector3(-1.55,.92,-1.19),0x705e50,true);
    this.anchors.bedApproach=new THREE.Vector3(.55,0,-.45);
    this.anchors.bedSit=new THREE.Vector3(.88,.56,-.45);
    this.anchors.bedLie=new THREE.Vector3(1.55,.72,-.72);
    this.anchors.blanketGrab=new THREE.Vector3(.92,.72,-1.42);
    this.anchors.roomCenter=new THREE.Vector3(0,0,.55);
    this.blanket=new BlanketCloth({scene:this.group,center:new THREE.Vector3(1.55,.68,-.68)});
  }
  registerPhysics(bodyPhysics){
    bodyPhysics?.rebuildGround?.(3.6);
    for(const c of this.colliders)bodyPhysics?.addFixedBoxCollider?.({name:c.name,size:c.size,position:c.position});
  }
  anchor(name){return this.anchors[name]?.clone?.()||null;}
  setBlanket(mode,progress){this.blanket.setInteraction(mode,progress);}
  update(dt){this.blanket.update(dt);}
  state(){return {room:'bedroom-v1',colliders:this.colliders.length,anchors:Object.keys(this.anchors),blanket:this.blanket.mode};}
}
