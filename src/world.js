import * as THREE from '../vendor/three.module.js';
import { walk, layout, gaze, seaSurface } from './physics.js';
import { makeScenery } from './scenery.js';
import { marineSprites, stepMarine, knockSurfer } from './ocean.js';

export async function createGarden(canvas, projects, callbacks) {
  const logos = await Promise.all(projects.map(async project => {
    const image = new Image(); image.src = project.logo;
    await image.decode(); return image;
  }));
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1000, 0, 530, .1, 1000);
  camera.position.z = 500;
  let width = 1000, height = 530, positions = [], clouds = [];
  let hero, trail, ring, sea, scenery, sky, bottles = [], active = false, frame = 0, last = 0, elapsed = 0;
  const seed = Math.random() * 1000;
  let pointer, pointerClient;
  let destination = null;
  let seaTap, marine = [], ripples = [], lastRipple = 0, previousPointer;
  const visitors = new Map();
  let bottleNearby = -1;
  let reduced = callbacks.reduced, dragging = false, moved = false, nearby = -1;
  const keys = new Set();
  const body = { x: 500, y: 265, vx: 0, vy: 0 };
  const target = { x: 500, y: 265 };
  const trailPoints = Array.from({ length: 38 }, () => ({ x: -100, y: -100, life: 0 }));
  let trailIndex = 0, trailClock = 0;
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { ratio: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute vec3 tint; attribute float size; attribute float opacity; varying vec3 vTint; varying float vOpacity; uniform float ratio; void main(){ vTint=tint; vOpacity=opacity; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize=size*ratio; }`,
    fragmentShader: `varying vec3 vTint; varying float vOpacity; void main(){ gl_FragColor=vec4(vTint,vOpacity); }`,
  });
  function dots(points, dynamic = false) {
    const geometry = new THREE.BufferGeometry();
    const colors = [], positions = [], sizes = [], opacities = [];
    for (const point of points) {
      positions.push(point.x, point.y, point.z ?? 0);
      const color = new THREE.Color(point.color ?? '#819474');
      // Raw shader output uses sRGB colours, matching the DOM and canvas rasterizer.
      color.convertLinearToSRGB();
      colors.push(color.r, color.g, color.b);
      sizes.push(point.size ?? 2);
      opacities.push(point.opacity ?? 1);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('tint', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('opacity', new THREE.Float32BufferAttribute(opacities, 1));
    if (dynamic) geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const object = new THREE.Points(geometry, material);
    object.frustumCulled = false;
    scene.add(object);
    return object;
  }
  function remove(object) { if (object) { scene.remove(object); object.geometry.dispose(); } }
  function sample(draw, scale = 1, spacing = .5) {
    const buffer = document.createElement('canvas');
    const resolution = 2, rasterWidth = 320 * resolution;
    buffer.width = rasterWidth; buffer.height = 200 * resolution;
    const ctx = buffer.getContext('2d', { willReadFrequently: true });
    ctx.scale(resolution, resolution);
    draw(ctx);
    const pixels = ctx.getImageData(0, 0, buffer.width, buffer.height).data;
    const result = [];
    for (let y = 0; y < buffer.height; y += spacing * resolution) for (let x = 0; x < rasterWidth; x += spacing * resolution) {
      const i = (y * rasterWidth + x) * 4;
      if (pixels[i + 3] < 128) continue;
      result.push({ x: (x / resolution - 160) * scale, y: (y / resolution - 110) * scale, color: `rgb(${pixels[i]},${pixels[i+1]},${pixels[i+2]})`, size: spacing * scale });
    }
    return result;
  }
  const buttons = projects.map((project, index) => {
    const button = document.createElement('a');
    button.className = 'portal';
    button.href = project.url;
    button.target = '_blank';
    button.rel = 'noopener noreferrer';
    button.setAttribute('aria-label', `Walk to ${project.name}`);
    const label = document.createElement('span'); label.className = 'sr-only';label.textContent = project.name;
    button.append(label);
    button.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (nearby === index) { callbacks.select(index); return; }
      const score=p=>Math.abs(p.x)+Math.abs(p.y+8);
      const point=clouds[index].home.reduce((best,p)=>score(p)<score(best)?p:best);
      go(positions[index].x+point.x, positions[index].y+point.y, { project: index });
    });
    document.getElementById('portals').append(button);
    return button;
  });
  const bottleButtons = ['Open a bottle', 'Leave a note'].map((label, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'bottle'; button.setAttribute('aria-label', label);
    button.addEventListener('click', () => {
      stopWalking(); callbacks.bottle?.(index);
    });
    document.getElementById('portals').append(button);
    return button;
  });
  function scatter(index) {
    if (reduced) return;
    const cloud = clouds[index];
    for (let i=0;i<cloud.home.length;i++) {
      const angle = Math.random()*Math.PI*2;
      const force = 55+Math.random()*100;
      cloud.velocity[i*2] += Math.cos(angle)*force;
      cloud.velocity[i*2+1] += Math.sin(angle)*force;
    }
  }
  function go(x,y, chosen = null) {
    moved = true;
    destination = chosen;
    target.x = Math.max(20, Math.min(width-20,x));
    target.y = Math.max(35, Math.min(height-40,y));
    ring.position.set(target.x,target.y,8);ring.userData.life=1;
    if(reduced){body.x=target.x;body.y=target.y;body.vx=body.vy=0;}
    callbacks.step();
    if(reduced) renderOnce();
  }
  function stopWalking() {
    dragging=false;keys.clear();moved=false;destination={bottle:1};
    target.x=body.x;target.y=body.y;body.vx=body.vy=0;
  }
  function splash(x,y,strength=8) {
    if(reduced)return;
    ripples.push({x,y,at:elapsed,strength});
    if(ripples.length>5)ripples.shift();
  }
  function build() {
    width = canvas.clientWidth; height = canvas.clientHeight;
    if(!width || !height) return;
    renderer.setSize(width,height,false);
    camera.right=width;camera.bottom=height;camera.updateProjectionMatrix();
    positions=layout(width,height-220,seed);
    const small=width<650;
    clouds.forEach((cloud)=>remove(cloud.object));clouds=[];
    positions.forEach((pos,index)=>{
      buttons[index].setAttribute('aria-label', `Walk to ${projects[index].name}`);
      buttons[index].style.left=`${pos.x}px`;buttons[index].style.top=`${pos.y}px`;
      const project=projects[index];
      const scale=small?.9:1;
      const icon=sample(ctx=>ctx.drawImage(logos[index],128,8,64,64),scale,2).map(p=>({...p,logo:true}));
      const glints=[[-43,-79],[44,-54],[30,-108]].map(([x,y],i)=>({x:x*scale,y:y*scale,color:project.color,size:i?2:3,opacity:.35,glint:i+1}));
      const title=sample((ctx)=>{
        ctx.fillStyle=project.color;
        ctx.font=`400 ${project.name==='MagicScreenshots'?25:30}px "Geist Pixel"`;ctx.textAlign='center';ctx.fillText(project.name,160,110);
      },scale).map(p=>({...p,title:true}));
      const caption=sample((ctx)=>{
        ctx.fillStyle='#596856';ctx.font='400 16px "Geist Pixel"';
        ctx.textAlign='center';
        const words=project.subtitle.split(' '),lines=[];let line='';
        for(const word of words){const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width>260&&line){lines.push(line);line=word;}else line=next;}
        lines.push(line);lines.forEach((text,i)=>ctx.fillText(text,160,136+i*21));
      },scale);
      const home=[...icon,...glints,...title,...caption];
      const object=dots(home.map(p=>({...p,x:p.x+pos.x,y:p.y+pos.y,z:12})),true);
      clouds.push({object,home,scale,hover:0,velocity:new Float32Array(home.length*2)});
    });
    if(!hero){
      const shape = [
        '     hhhhh     ',
        '    hhhhhhh    ',
        '    hfffffh    ',
        '    ffffffff   ',
        '    sgsssgss   ',
        '    sssffsss   ',
        '    fffffff    ',
        '     fffff     ',
        '      fff      ',
        '    clssscc    ',
        '   cclssslcc   ',
        '   cclssslcc   ',
        '   cclssslcc   ',
        '   cclssslcc   ',
        '   fclssslcf   ',
        '   fclssslcf   ',
        '    clssscc    ',
        '   cclsssccc   ',
        '   cclsssccc   ',
        '   cc sss cc   ',
        '     ss ss     ',
        '     ss ss     ',
        '    sss sss    ',
      ];
      const palette = {h:'#242b28',s:'#19221f',c:'#293932',l:'#526757',f:'#e2c2a4',g:'#91caa6'};
      const pixels=[];
      shape.forEach((row,y)=>[...row].forEach((c,x)=>{
        if(c!==' ') pixels.push({x:(x-7)*2.2,y:(y-11)*2.2,z:30,color:palette[c],size:2.3,eye:c==='g',leg:y>=20?(x<7?-1:1):0,upper:y<17,coat:c==='c'||c==='l'});
      }));
      hero=dots(pixels,true);hero.userData.home=pixels;
      hero.userData.dodge={lean:0,velocity:0,side:1,hover:false};
      trail=dots(trailPoints.map(p=>({...p,z:5,color:'#aabe8d',size:3,opacity:0})),true);
      const circle=Array.from({length:24},(_,i)=>({x:Math.cos(i/24*Math.PI*2)*12,y:Math.sin(i/24*Math.PI*2)*5,z:1,color:'#91a77d',size:1.6,opacity:.65}));
      ring=dots(circle);ring.userData.life=0;
    }
    remove(sea); bottles.forEach(remove);
    marine.forEach(creature=>remove(creature.object));ripples=[];previousPointer=undefined;
    remove(scenery); remove(sky);
    const {land,sky:skyPixels,water}=makeScenery(width,height,positions,seed);
    scenery=dots(land);
    sky=dots(skyPixels,true);
    sky.userData={home:skyPixels,velocity:new Float32Array(skyPixels.length*2)};
    sea=dots(water,true);sea.userData.home=water;
    marine=marineSprites(width,height).map(creature=>({...creature,object:dots(creature.home,true)}));
    const bottleShape=['  cc  ','  gg  ',' gggg ','gpwwpg','gpwwpg','gpwwpg',' gggg '];
    bottles=[0,1].map(index=>{
      const pixels=[];
      const palette={c:'#a47a4e',g:index?'#496aab':'#387f72',p:'#b8e9d7',w:'#fff3cb'};
      bottleShape.forEach((row,y)=>[...row].forEach((c,x)=>{if(c!==' ')pixels.push({x:(x-2.5)*2.6,y:(y-3)*2.6,z:32,color:palette[c],size:2.7});}));
      bottleButtons[index].style.left=`${width*(index?.66:.34)}px`;
      bottleButtons[index].style.top=`${height-65}px`;
      return dots(pixels);
    });
    body.x=width*.3;body.y=85;body.vx=body.vy=0;
    target.x=body.x;target.y=body.y;nearby=-1;bottleNearby=-1;
    renderOnce();
  }
  function poseCharacter(object,x,y,speed,vx,dt) {
    const dodge=object.userData.dodge;
    const hovering=!!pointer&&Math.abs(pointer.x-x)<45&&Math.abs(pointer.y-y)<43;
    if(hovering&&!dodge.hover)dodge.side=pointer.x>=x?-1:1;
    dodge.hover=hovering;
    if(reduced){dodge.lean=dodge.velocity=0;}
    else {
      dodge.velocity+=((hovering?1:0)-dodge.lean)*38*dt-dodge.velocity*9*dt;
      dodge.lean=Math.max(0,Math.min(1.06,dodge.lean+dodge.velocity*dt));
    }
    // The torso hinges at the hips; the legs keep their walking pose below it.
    const angle=dodge.lean*dodge.side*1.14,cos=Math.cos(angle),sin=Math.sin(angle),hip=12;
    const stride=reduced?0:Math.sin(elapsed*18)*Math.min(speed/70,2.2);
    const look=gaze(x,y,pointer);
    const pose=object.geometry.attributes.position;
    object.userData.home.forEach((pixel,index)=>{
      let px=pixel.x+(pixel.eye?look.x*.55:0);
      let py=pixel.y+pixel.leg*stride+(pixel.eye?look.y*.55:0);
      if(pixel.upper){
        const dy=py-hip;
        py=hip+px*sin+dy*cos;px=px*cos-dy*sin;
      } else if(pixel.coat&&!reduced) {
        px+=Math.sin(elapsed*7+pixel.y*.15)*Math.min(speed/140,1.4)+dodge.side*dodge.lean*(pixel.y-hip)*.45;
      }
      pose.array[index*3]=px;pose.array[index*3+1]=py;
    });
    pose.needsUpdate=true;
    object.rotation.z=reduced?0:vx*.00036*(1-dodge.lean);
    object.scale.set(1+Math.min(speed/2500,.13)*(1-dodge.lean),1-Math.min(speed/3500,.1)*(1-dodge.lean),1);
    return dodge.lean;
  }
  function update(dt) {
    if(pointerClient)pointer=coords(pointerClient);
    elapsed+=dt;
    if(keys.size){
      let dx=Number(keys.has('ArrowRight')||keys.has('d'))-Number(keys.has('ArrowLeft')||keys.has('a'));
      let dy=Number(keys.has('ArrowDown')||keys.has('s'))-Number(keys.has('ArrowUp')||keys.has('w'));
      const length=Math.hypot(dx,dy)||1;
      target.x=Math.max(20,Math.min(width-20,body.x+dx/length*70));
      target.y=Math.max(35,Math.min(height-40,body.y+dy/length*70));
      if(reduced){body.x+=dx*3;body.y+=dy*3;}
    }
    if(!reduced)walk(body,target,dt,width,height);
    const speed=Math.hypot(body.vx,body.vy);
    const lean=poseCharacter(hero,body.x,body.y,speed,body.vx,dt);
    const bob=reduced?0:Math.sin(elapsed*(speed>15?18:2.5))*(speed>15?1.8:1.4)*(1-lean);
    hero.position.set(body.x,body.y+bob,0);
    const waterPositions=sea.geometry.attributes.position, waterOpacity=sea.geometry.attributes.opacity;
    const time=reduced?0:elapsed;
    ripples=ripples.filter(r=>elapsed-r.at<2.4);
    if(pointer&&pointer.y>=seaSurface(pointer.x,height,time)) {
      const distance=previousPointer?Math.hypot(pointer.x-previousPointer.x,pointer.y-previousPointer.y):0;
      if(distance>3&&elapsed-lastRipple>.07){splash(pointer.x,pointer.y,Math.min(12,4+distance*.2));lastRipple=elapsed;}
    }
    previousPointer=pointer?{...pointer}:undefined;
    const skyPosition=sky.geometry.attributes.position,skyOpacity=sky.geometry.attributes.opacity;
    sky.userData.home.forEach((p,i)=>{
      const hx=p.x+(reduced||p.star?0:Math.sin(time*.45+p.phase)*5);
      const hy=p.y+(reduced||p.star?0:Math.sin(time*.7+p.phase)*4);
      let vx=sky.userData.velocity[i*2],vy=sky.userData.velocity[i*2+1];
      let x=skyPosition.array[i*3],y=skyPosition.array[i*3+1];
      if(!reduced){
        if(pointer){
          const dx=x-pointer.x,dy=y-pointer.y,distance=Math.hypot(dx,dy);
          if(distance<40){
            const force=(1-distance/40)*1700*dt,angle=i*2.399963;
            vx+=((distance?dx/distance:0)+Math.cos(angle)*.35)*force;
            vy+=((distance?dy/distance:0)+Math.sin(angle)*.35)*force;
          }
        }
        vx+=(hx-x)*28*dt;vy+=(hy-y)*28*dt;
        vx*=Math.exp(-6*dt);vy*=Math.exp(-6*dt);
        x+=vx*dt;y+=vy*dt;
      }else{x=hx;y=hy;}
      sky.userData.velocity[i*2]=vx;sky.userData.velocity[i*2+1]=vy;
      skyPosition.array[i*3]=x;skyPosition.array[i*3+1]=y;
      skyOpacity.array[i]=p.opacity*(p.star&&!reduced?.8+Math.sin(time*1.2+p.phase)*.2:1);
    });
    skyPosition.needsUpdate=skyOpacity.needsUpdate=true;
    sea.userData.home.forEach((p,i)=>{
      const edge=seaSurface(p.x,height,time);
      const depth=p.y-edge;
      const ripple=Math.sin(p.x*.018+depth*.2-time*1.6);
      const wake=Math.max(0,1-Math.hypot(p.x-body.x,(p.y-body.y)*1.5)/65)*Math.min(speed/130,1);
      let disturbance=0;
      for(const wave of ripples){
        const age=elapsed-wave.at,distance=Math.hypot(p.x-wave.x,(p.y-wave.y)*1.5),front=distance-age*90;
        disturbance+=Math.sin(front*.14)*Math.exp(-Math.abs(front)*.035-age*1.4)*wave.strength;
      }
      const cursor=pointer?Math.max(0,1-Math.hypot(p.x-pointer.x,(p.y-pointer.y)*1.4)/65):0;
      waterPositions.array[i*3+1]=p.y+(reduced?0:Math.sin(p.x*.025+time)*1.3+disturbance+cursor*Math.sin(p.x*.09-time*3)*3)+wake*Math.sin(depth*.2-time*6)*4;
      waterOpacity.array[i]=depth<0?0:depth<5?.9:(.5+Math.max(0,ripple)*.3+Math.max(0,wake)*.18+Math.abs(disturbance)*.018)*Math.min(1,(height-p.y)/22);
    });
    waterPositions.needsUpdate=waterOpacity.needsUpdate=true;
    marine.forEach(creature=>{
      const pose=stepMarine(creature,dt,time,width,height,pointer,body,reduced);
      if(pose.knocked)splash(pose.x,pose.y,14);
      const object=creature.object;
      object.position.set(pose.x,pose.y,0);object.rotation.z=pose.rotation;object.scale.x=pose.direction;
      if(creature.kind==='surfer'){
        const attr=object.geometry.attributes.position,angle=pose.fall*creature.side*1.65;
        creature.home.forEach((p,i)=>{
          attr.array[i*3]=p.rider?p.x*Math.cos(angle)-p.y*Math.sin(angle):p.x;
          attr.array[i*3+1]=p.rider?p.x*Math.sin(angle)+p.y*Math.cos(angle)+pose.fall*7:p.y;
        });attr.needsUpdate=true;
      }
    });
    let nearBottle=-1;
    bottles.forEach((bottle,index)=>{
      const x=width*(index?.66:.34),y=height-65;
      bottle.position.set(x,y+Math.sin(time*1.7+index*2)*2,0);
      bottle.rotation.z=Math.sin(time*1.3+index)*.13;
      if(Math.hypot(body.x-x,body.y-y)<23)nearBottle=index;
    });
    if(nearBottle!==bottleNearby){
      bottleNearby=nearBottle;
      if(nearBottle>=0&&moved&&(!destination||destination.bottle===nearBottle))callbacks.bottle?.(nearBottle);
    }
    visitors.forEach(visitor=>{
      visitor.object.visible=Date.now()-visitor.at<20000;
      const dx=visitor.x*width-visitor.object.position.x,dy=visitor.y*height-visitor.object.position.y;
      visitor.object.position.x+=dx*(reduced?1:Math.min(1,dt*3));
      visitor.object.position.y+=dy*(reduced?1:Math.min(1,dt*3));
      poseCharacter(visitor.object,visitor.object.position.x,visitor.object.position.y,Math.min(150,Math.hypot(dx,dy)*3),Math.max(-180,Math.min(180,dx*3)),dt);
    });
    let found=-1;
    positions.forEach((pos,index)=>{
      const cloud=clouds[index],attr=cloud.object.geometry.attributes.position,array=attr.array;
      const tilt=reduced?0:Math.sin(elapsed*.7+index*1.4)*.055;
      const cos=Math.cos(tilt),sin=Math.sin(tilt),center=70*cloud.scale;
      const hovering=pointer&&Math.abs(pointer.x-pos.x)<145&&Math.abs(pointer.y-pos.y+20)<90;
      cloud.hover+=((hovering?1:0)-cloud.hover)*Math.min(1,dt*5);
      for(let i=0;i<cloud.home.length;i++){
        const home=cloud.home[i];
        const cx=home.x,cy=home.y+center;
        const hx=pos.x+(home.logo?cx*cos-cy*sin:home.x);
        const float=reduced?0:Math.sin(elapsed*.85+index*1.7)*4;
        const ripple=reduced||!home.title?0:Math.sin(home.x*.055-elapsed*3)*cloud.hover*2;
        const glint=reduced||!home.glint?0:Math.sin(elapsed*1.3+home.glint+index)*4;
        const hy=pos.y+(home.logo?cx*sin+cy*cos-center:home.y)+float+ripple+glint;
        if(Math.abs(body.x-hx)<16 && Math.abs(body.y-hy)<16)found=index;
        if(reduced){array[i*3]=hx;array[i*3+1]=hy;continue;}
        let vx=cloud.velocity[i*2],vy=cloud.velocity[i*2+1];
        const dx=array[i*3]-body.x,dy=array[i*3+1]-body.y,dist=Math.hypot(dx,dy);
        if(dist<27&&speed>20){vx+=dx/(dist||1)*speed*dt*8;vy+=dy/(dist||1)*speed*dt*8;}
        if(pointer){
          const px=array[i*3]-pointer.x,py=array[i*3+1]-pointer.y,distance=Math.hypot(px,py);
          const reach=28+(i%9)*3;
          if(distance<reach){
            const force=(1-distance/reach)*(1400+(i%7)*160)*dt;
            const angle=i*2.399963;
            vx+=((distance?px/distance:0)+Math.cos(angle)*.35)*force;
            vy+=((distance?py/distance:0)+Math.sin(angle)*.35)*force;
          }
        }
        vx+=((hx-array[i*3])*28-vx*6)*dt;
        vy+=((hy-array[i*3+1])*28-vy*6)*dt;
        array[i*3]+=vx*dt;array[i*3+1]+=vy*dt;
        cloud.velocity[i*2]=vx;cloud.velocity[i*2+1]=vy;
      }
      attr.needsUpdate=true;
    });
    if(found!==nearby){
      nearby=found;
      if(found>=0&&moved&&(!destination||destination.project===found)){scatter(found);callbacks.select(found);}
    }
    trailClock+=dt;
    if(speed>22&&trailClock>.027&&!reduced){
      const p=trailPoints[trailIndex++%trailPoints.length];p.x=body.x+(Math.random()-.5)*10;p.y=body.y+12;p.life=1;trailClock=0;
    }
    const tp=trail.geometry.attributes.position,to=trail.geometry.attributes.opacity;
    trailPoints.forEach((p,i)=>{p.life=Math.max(0,p.life-dt*.9);tp.array[i*3]=p.x;tp.array[i*3+1]=p.y;to.array[i]=p.life*.38;});
    tp.needsUpdate=to.needsUpdate=true;
    ring.userData.life=Math.max(0,ring.userData.life-dt*1.9);
    ring.visible=ring.userData.life>0&&!reduced;
    ring.scale.setScalar(1+(1-ring.userData.life)*1.6);
    ring.geometry.attributes.opacity.array.fill(ring.userData.life*.55);ring.geometry.attributes.opacity.needsUpdate=true;
  }
  function renderOnce(){update(1/60);renderer.render(scene,camera);}
  function animate(now){if(!active)return;const dt=Math.min((now-last)/1000||1/60,1/30);last=now;update(dt);renderer.render(scene,camera);frame=requestAnimationFrame(animate);}
  function setActive(value){
    active=value;cancelAnimationFrame(frame);keys.clear();dragging=false;seaTap=undefined;
    if(value){if(width!==canvas.clientWidth||height!==canvas.clientHeight)build();last=performance.now();if(reduced)renderOnce();else frame=requestAnimationFrame(animate);}
  }
  function coords(event){const rect=canvas.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};}
  document.addEventListener('pointermove',event=>{if(event.pointerType==='mouse'){pointerClient={clientX:event.clientX,clientY:event.clientY};if(reduced)renderOnce();}});
  document.addEventListener('pointerleave',()=>{pointer=pointerClient=undefined;});
  canvas.addEventListener('pointerdown',(event)=>{
    if(event.button!==0)return;
    seaTap=undefined;
    const p=coords(event);
    if(p.y>=seaSurface(p.x,height,reduced?0:elapsed)){
      stopWalking();splash(p.x,p.y,13);
      const surfer=marine.find(c=>c.kind==='surfer'&&Math.hypot(p.x-c.x,p.y-c.y+10)<27);
      if(surfer){if(knockSurfer(surfer,elapsed,p.x<surfer.x?1:-1))callbacks.step();return;}
      seaTap={id:event.pointerId,x:event.clientX,y:event.clientY};
      return;
    }
    dragging=true;go(p.x,p.y);
    if(event.pointerType==='mouse')canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',(event)=>{if(!dragging)return;const p=coords(event);target.x=Math.max(20,Math.min(width-20,p.x));target.y=Math.max(35,Math.min(height-40,p.y));if(reduced)go(p.x,p.y);});
  canvas.addEventListener('pointerup',event=>{
    const tap=seaTap;seaTap=undefined;dragging=false;
    if(tap&&tap.id===event.pointerId&&Math.hypot(event.clientX-tap.x,event.clientY-tap.y)<9)callbacks.bottle?.(1);
  });
  const cancel=()=>{seaTap=undefined;dragging=false;};
  canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);
  document.addEventListener('pointerup',cancel);
  canvas.addEventListener('keydown',(event)=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(event.key))return;
    event.preventDefault();keys.add(event.key);moved=true;destination=null;if(!event.repeat)callbacks.step();if(reduced)renderOnce();
  });
  canvas.addEventListener('keyup',(event)=>{keys.delete(event.key);if(!keys.size){target.x=body.x+body.vx*.12;target.y=body.y+body.vy*.12;}});
  canvas.addEventListener('blur',()=>keys.clear());
  new ResizeObserver(()=>{if(canvas.clientWidth&&canvas.clientHeight)build();}).observe(canvas);
  build();
  return {
    setActive,setReduced(value){reduced=value;setActive(active);},
    position(){return{x:body.x/width,y:body.y/height};},
    setVisitors(people){
      const ids=new Set(people.map(p=>p.id));
      visitors.forEach((visitor,id)=>{if(!ids.has(id)){remove(visitor.object);visitors.delete(id);}});
      for(const person of people){
        let visitor=visitors.get(person.id);
        if(!visitor){
          const color=['#a5b9cd','#baa8ca','#a4b99c','#d3a8b4'][parseInt(person.id.slice(0,2),16)%4];
          const pixels=hero.userData.home.map(p=>({...p,color:p.coat?color:p.color,opacity:.7}));
          const object=dots(pixels,true);
          object.userData.home=pixels;
          object.userData.dodge={lean:0,velocity:0,side:1,hover:false};
          object.position.set(person.x*width,person.y*height,0);
          visitor={object};visitors.set(person.id,visitor);
        }
        Object.assign(visitor,{x:person.x,y:person.y,at:person.at});
      }
      if(reduced)renderOnce();
    },
  };
}
