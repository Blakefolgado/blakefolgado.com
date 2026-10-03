import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { walk, layout, gaze, visibleBounds, keepInView, keyboardPan, wanderTarget } from '../src/physics.js';
import { marineSprites, stepMarine } from '../src/ocean.js';

test('walking has momentum, settles at its destination, and remains inside the garden', () => {
  const body = { x: 100, y: 100, vx: 0, vy: 0 };
  const target = { x: 480, y: 300 };
  walk(body, target, 1/60, 1000, 530);
  assert.ok(body.x > 100 && body.x < 110, 'first step accelerates instead of teleporting');
  for (let i=0;i<360;i++) walk(body,target,1/60,1000,530);
  assert.ok(Math.hypot(body.x-target.x,body.y-target.y)<.1);
  assert.ok(Math.hypot(body.vx,body.vy)<.1);
  for (let i=0;i<200;i++) walk(body,{x:-1000,y:3000},2,1000,530);
  assert.ok(body.x>=20 && body.y<=490, 'a long pause or out-of-bounds target cannot lose the character');
});

test('random worlds preserve priority and keep all seven project labels apart and inside the page', async () => {
  for (const [width,height] of [[320,1310],[1036,1410]]) {
    const positions=layout(width,height,23);
    assert.equal(positions.length,7);
    for(const p of positions) assert.ok(p.x>70 && p.x<width-70 && p.y>50 && p.y<height-50);
    for(let i=1;i<positions.length;i++)assert.ok(positions[i].y-positions[i-1].y>145,'floating labels cannot overlap');
    assert.deepEqual(layout(width,height,23),positions,'resizing cannot reshuffle the same world');
    assert.notDeepEqual(layout(width,height,42),positions,'another visitor gets a different world');
  }
  const html=await readFile('index.html','utf8');
  assert.deepEqual([...html.matchAll(/<strong>(.*?)<\/strong>/g)].map(m=>m[1]),['Tradehand','ToolRouter','Outside','HumanLeap','SentryDock','bot.store','MagicScreenshots']);
  assert.equal([...html.matchAll(/class="portal"/g)].length,7,'project destinations exist before the world loads');
  assert.match(html,/<section id="garden" aria-label="Explore my projects">/,'the initial page reserves the world on mobile too');
  assert.doesNotMatch(html,/<ol\b|id="project-list"/,'slow loading cannot expose a second project list');
  assert.ok(!JSON.parse(await readFile('vercel.json','utf8')).crons);
  const packageJson=JSON.parse(await readFile('package.json','utf8'));
  assert.ok(!packageJson.scripts.build.includes('generate'));
});

test('eyes follow the cursor in every direction but remain inside the face', () => {
  assert.deepEqual(gaze(10,10),{x:0,y:0});
  assert.deepEqual(gaze(10,10,{x:10,y:10}),{x:0,y:0});
  for(const [x,y]of [[-1000,0],[1000,0],[0,-1000],[0,1000],[1000,1000]]){
    const look=gaze(0,0,{x,y});
    assert.equal(Math.sign(look.x),Math.sign(x));assert.equal(Math.sign(look.y),Math.sign(y));
    assert.ok(Math.abs(look.x)<=1.7&&Math.abs(look.y)<=1.2);
  }
});

test('the surfer recovers after a knock instead of falling forever under a parked cursor', () => {
  const surfer=marineSprites(390,1530).find(c=>c.kind==='surfer');
  const pointer={x:surfer.x,y:surfer.y-10},body={x:0,y:0,vx:0,vy:0};
  let knocks=0,pose;
  for(let i=0;i<240;i++){
    pose=stepMarine(surfer,1/60,i/60,390,1530,pointer,body,false);
    if(pose.knocked)knocks++;
    if(i===30)assert.equal(pose.fall,1,'the rider stays down long enough to see the splash');
  }
  assert.equal(knocks,1,'remaining hovered must not repeatedly knock the rider down');
  assert.equal(pose.fall,0,'the rider gets back on the board');
  stepMarine(surfer,1/60,5,390,1530,undefined,body,false);
  assert.equal(stepMarine(surfer,1/60,5.1,390,1530,{x:surfer.x,y:surfer.y-10},body,false).knocked,true);
  const still=stepMarine(surfer,1/60,5.2,390,1530,pointer,body,true);
  assert.equal(still.fall,0);assert.equal(still.rotation,0);
});

test('scrolling keeps the whole character in the visible world and cancels outward velocity', () => {
  const body={x:120,y:85,vx:0,vy:-200},target={x:-100,y:-100};
  for(const top of [300,-500,-1050,-500,300]){
    const bounds=visibleBounds({left:16,top,width:358,height:1530},{width:390,height:640});
    const previousY=body.y;
    keepInView(body,target,bounds);
    assert.ok(body.y+top>=44&&body.y+top<=596,'the sprite retains room for its head and boots');
    assert.ok(body.x>=bounds.left&&body.x<=bounds.right);
    assert.ok(target.y>=bounds.top&&target.y<=bounds.bottom,'old off-screen targets cannot pull him out again');
    if(previousY!==body.y)assert.equal(body.vy,0,'hitting the viewport edge removes the old vertical pull');
  }
  assert.equal(visibleBounds({left:0,top:-1700,width:390,height:1530},{width:390,height:640}),null);
});

test('idle strolls stay in the current viewport and use a gentler walking speed', () => {
  const bounds={left:44,right:314,top:950,bottom:1450};
  const body={x:120,y:1000,vx:0,vy:0};
  const target=wanderTarget(body,bounds,[{x:100,y:120},{x:220,y:1100}],()=>.75);
  assert.ok(Math.hypot(target.x-body.x,target.y-body.y)>40,'idle movement picks a real stroll');
  assert.ok(target.x>=bounds.left&&target.x<=bounds.right&&target.y>=bounds.top&&target.y<=bounds.bottom);
  for(let i=0;i<180;i++){
    walk(body,target,1/60,358,1530,100);keepInView(body,target,bounds);
    assert.ok(Math.hypot(body.vx,body.vy)<=100.001,'autonomous movement stays calm');
  }
  assert.ok(Math.hypot(body.x-target.x,body.y-target.y)<1);
});

test('keyboard travel carries the view through the map instead of pinning Neo at its visible edge', () => {
  const height=1530,viewport={width:390,height:640};
  const rect={left:16,top:-200,width:358,height};
  const body={x:120,y:780,vx:0,vy:0},target={x:120,y:780};
  const startY=body.y;
  for(let i=0;i<180;i++){
    let bounds=visibleBounds(rect,viewport);
    keepInView(body,target,bounds);target.y=body.y+70;
    walk(body,target,1/60,358,height);
    rect.top-=keyboardPan(body,1,bounds,1/60,height);
    bounds=visibleBounds(rect,viewport);keepInView(body,target,bounds);
    assert.ok(body.y+rect.top<=596,'keyboard scrolling keeps the entire sprite on screen');
  }
  assert.ok(body.y>startY+400,'holding Down advances through the world');
  assert.ok(rect.top<-600,'the view travels with Neo');
  const downY=body.y;
  for(let i=0;i<180;i++){
    let bounds=visibleBounds(rect,viewport);
    keepInView(body,target,bounds);target.y=body.y-70;
    walk(body,target,1/60,358,height);
    rect.top-=keyboardPan(body,-1,bounds,1/60,height);
    bounds=visibleBounds(rect,viewport);keepInView(body,target,bounds);
    assert.ok(body.y+rect.top>=44,'Up also retains room for his head');
  }
  assert.ok(body.y<downY-400,'Up can reverse the journey');
  assert.equal(keyboardPan(body,0,visibleBounds(rect,viewport),1/60,height),0,'horizontal movement cannot scroll the page');
  assert.equal(keyboardPan({y:height-44,vy:300},1,{bottom:height-44},1/60,height),0,'the camera stops at the real end of the world');
  assert.equal(keyboardPan(body,1,null,1/60,height),0,'an off-screen world does not pull the page back');
});

test('a single Down tap keeps its destination when the old viewport ends', () => {
  const rect={left:16,top:-200,width:358,height:1530},viewport={width:390,height:640};
  const body={x:120,y:796,vx:0,vy:0},target={x:120,y:866};
  for(let i=0;i<180;i++){
    const destination=target.y;
    keepInView(body,target,visibleBounds(rect,viewport));target.y=destination;
    walk(body,target,1/60,358,1530);
    rect.top-=keyboardPan(body,1,visibleBounds(rect,viewport),1/60,1530);
    keepInView(body,target,visibleBounds(rect,viewport));target.y=destination;
  }
  assert.ok(Math.abs(body.y-866)<1,'releasing Down must not cut a short step off at the old edge');
  assert.ok(rect.top<-260,'the view follows the short step');
  assert.ok(body.y+rect.top<=596,'Neo remains visible after the tap');
});
