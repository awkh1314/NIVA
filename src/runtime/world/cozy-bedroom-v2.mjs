import * as THREE from 'three';

function mat(color,roughness=.86,metalness=.01){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
function box(size,pos,material){const m=new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y,size.z),material);m.position.copy(pos);m.castShadow=true;m.receiveShadow=true;return m;}

export class CozyBedroomV2{
  constructor({scene}={}){this.scene=scene;this.group=new THREE.Group();this.group.name='NIVA_CozyBedroomV2';scene.add(this.group);this.colliders=[];this.anchors={};this.lights=[];this.build();}
  addBox(name,size,pos,material,{collider=true,shadow=true}={}){const m=box(size,pos,material);m.name=name;m.castShadow=shadow;m.receiveShadow=shadow;this.group.add(m);if(collider)this.colliders.push({name,size:size.clone(),position:pos.clone()});return m;}
  build(){
    const wood=mat(0x9a7657,.88),woodDark=mat(0x6a4e3d,.9),wall=mat(0xe8e0d1,.95),linen=mat(0xf2eee6,.98),blanket=mat(0xb9c8b5,.98),rug=mat(0xcbbda6,1),green=mat(0x5f7756,.96),ceramic=mat(0xd9d1c4,.7);
    this.addBox('roomFloor',new THREE.Vector3(6,.10,5),new THREE.Vector3(0,-.03,0),wood,{collider:false});
    this.addBox('wallBack',new THREE.Vector3(6,2.8,.12),new THREE.Vector3(0,1.4,-2.5),wall);
    this.addBox('wallLeft',new THREE.Vector3(.12,2.8,5),new THREE.Vector3(-3,1.4,0),wall);
    this.addBox('wallRight',new THREE.Vector3(.12,2.8,5),new THREE.Vector3(3,1.4,0),wall);
    // Front wall is intentionally split, leaving a real 1.5m doorway to the lawn.
    this.addBox('wallFrontLeft',new THREE.Vector3(2.25,2.8,.12),new THREE.Vector3(-1.875,1.4,2.5),wall);
    this.addBox('wallFrontRight',new THREE.Vector3(2.25,2.8,.12),new THREE.Vector3(1.875,1.4,2.5),wall);
    const lintel=this.addBox('doorLintel',new THREE.Vector3(1.5,.55,.12),new THREE.Vector3(0,2.525,2.5),wall,{collider:true});lintel.castShadow=true;
    const bedCenter=new THREE.Vector3(1.55,.27,-.72);this.addBox('bedFrame',new THREE.Vector3(1.52,.34,2.06),bedCenter,woodDark);this.addBox('mattress',new THREE.Vector3(1.40,.22,1.94),new THREE.Vector3(1.55,.50,-.72),linen);this.addBox('pillow',new THREE.Vector3(.88,.16,.43),new THREE.Vector3(1.55,.69,-1.38),linen,{collider:false});
    this.addBox('headboard',new THREE.Vector3(1.58,.85,.12),new THREE.Vector3(1.55,.72,-1.78),woodDark);
    this.addBox('bedsideTable',new THREE.Vector3(.58,.62,.58),new THREE.Vector3(2.45,.31,-1.34),woodDark);this.addBox('lampBase',new THREE.Vector3(.18,.05,.18),new THREE.Vector3(2.45,.66,-1.34),ceramic,{collider:false});
    const lampShade=new THREE.Mesh(new THREE.CylinderGeometry(.12,.22,.28,16,1,true),new THREE.MeshStandardMaterial({color:0xf3d9ae,roughness:.8,side:THREE.DoubleSide}));lampShade.position.set(2.45,.85,-1.34);lampShade.castShadow=true;this.group.add(lampShade);
    const warm=new THREE.PointLight(0xffc98c,1.15,4.2,2);warm.position.set(2.45,.93,-1.30);this.group.add(warm);this.lights.push(warm);
    this.addBox('deskTop',new THREE.Vector3(1.25,.10,.58),new THREE.Vector3(-1.82,.78,-1.55),woodDark);this.addBox('deskLeftLeg',new THREE.Vector3(.10,.76,.10),new THREE.Vector3(-2.28,.38,-1.55),woodDark);this.addBox('deskRightLeg',new THREE.Vector3(.10,.76,.10),new THREE.Vector3(-1.36,.38,-1.55),woodDark);
    this.addBox('chairSeat',new THREE.Vector3(.64,.12,.60),new THREE.Vector3(-1.72,.49,-.76),woodDark);this.addBox('chairBack',new THREE.Vector3(.64,.78,.10),new THREE.Vector3(-1.72,.88,-1.03),woodDark);
    const rugMesh=this.addBox('rug',new THREE.Vector3(2.0,.018,1.35),new THREE.Vector3(-.35,.018,-.15),rug,{collider:false,shadow:false});rugMesh.receiveShadow=true;
    // Window panel and frame add depth without blocking the outside-facing doorway.
    this.addBox('windowFrameTop',new THREE.Vector3(1.55,.07,.08),new THREE.Vector3(-1.15,2.18,-2.43),woodDark,{collider:false});this.addBox('windowFrameBottom',new THREE.Vector3(1.55,.07,.08),new THREE.Vector3(-1.15,.98,-2.43),woodDark,{collider:false});this.addBox('windowFrameLeft',new THREE.Vector3(.07,1.26,.08),new THREE.Vector3(-1.93,1.58,-2.43),woodDark,{collider:false});this.addBox('windowFrameRight',new THREE.Vector3(.07,1.26,.08),new THREE.Vector3(-.37,1.58,-2.43),woodDark,{collider:false});
    const glass=new THREE.Mesh(new THREE.PlaneGeometry(1.45,1.10),new THREE.MeshPhysicalMaterial({color:0xbfd4da,transparent:true,opacity:.22,roughness:.12,metalness:0,transmission:.25}));glass.position.set(-1.15,1.58,-2.435);this.group.add(glass);
    const pot=new THREE.Mesh(new THREE.CylinderGeometry(.16,.20,.26,12),new THREE.MeshStandardMaterial({color:0xb48666,roughness:.9}));pot.position.set(-2.45,.14,.95);pot.castShadow=true;this.group.add(pot);for(let i=0;i<7;i++){const leaf=new THREE.Mesh(new THREE.SphereGeometry(.10,10,6),green);leaf.scale.set(.55,1.7,.45);leaf.position.set(-2.45+(i%3-1)*.09,.36+(i%2)*.10,.95+(Math.floor(i/3)-1)*.07);leaf.rotation.z=(i-3)*.16;leaf.castShadow=true;this.group.add(leaf);}
    this.anchors.bedApproach=new THREE.Vector3(.55,0,-.45);this.anchors.bedSit=new THREE.Vector3(.88,.56,-.45);this.anchors.bedLie=new THREE.Vector3(1.55,.68,.18);this.anchors.blanketGrab=new THREE.Vector3(.92,.72,-1.42);this.anchors.roomCenter=new THREE.Vector3(0,0,.55);this.anchors.doorInside=new THREE.Vector3(0,0,1.85);this.anchors.doorOutside=new THREE.Vector3(0,0,3.15);this.anchors.lawnCenter=new THREE.Vector3(0,0,7.0);
    this.blanketMaterial=blanket;
  }
  anchor(name){return this.anchors[name]?.clone?.()||null;}
  state(){return {room:'cozy-bedroom-v2',colliders:this.colliders.length,anchors:Object.keys(this.anchors),doorOpen:true,warmLights:this.lights.length};}
}
