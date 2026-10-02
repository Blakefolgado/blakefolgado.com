// Small, browser-local action scene. Enemy time slows; the player's controls do not.
export const BULLET_LIMIT = 24;

export function segmentDistance(x, y, shot) {
  const dx = shot.x - shot.px, dy = shot.y - shot.py;
  const t = Math.max(0, Math.min(1, ((x - shot.px) * dx + (y - shot.py) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - shot.px - t * dx, y - shot.py - t * dy);
}

export function strikePixels(shot, array, velocity, index) {
  if (shot.hits & (1 << index)) return null;
  let hit = -1;
  for (let i = 0; i < array.length / 3; i++) {
    if (segmentDistance(array[i * 3], array[i * 3 + 1], shot) < 5) { hit = i; break; }
  }
  if (hit < 0) return null;
  shot.hits |= 1 << index;
  const x = array[hit * 3], y = array[hit * 3 + 1];
  for (let i = 0; i < array.length / 3; i++) {
    const dx = array[i * 3] - x, dy = array[i * 3 + 1] - y, distance = Math.hypot(dx, dy);
    if (distance >= 48) continue;
    const force = (1 - distance / 48) * 210, angle = i * 2.399963;
    velocity[i * 2] += (distance ? dx / distance : Math.cos(angle)) * force + shot.vx * .32;
    velocity[i * 2 + 1] += (distance ? dy / distance : Math.sin(angle)) * force + shot.vy * .32;
  }
  return { x, y };
}

export function createMatrix(width) {
  return { agents: Array.from({ length: width < 650 ? 2 : 3 }, (_, i) => ({
    x: 0, y: 0, vx: 0, vy: 0, aim: 0, cooldown: 1.2 + i * .6, flash: 0, phase: i * 2.4,
  })), bullets: [], scale: 1, time: 0, started: false, hitAt: -10 };
}

export function stepMatrix(state, dt, body, bounds, { slow = false, dodging = false, paused = false } = {}) {
  if (!bounds || paused) return [];
  state.scale += ((slow ? .09 : 1) - state.scale) * Math.min(1, dt * 12);
  const step = Math.min(dt, 1 / 30) * state.scale;
  state.time += step;
  if (!state.started) {
    state.agents.forEach((a, i) => {
      a.x = i % 2 ? bounds.right : bounds.left;
      a.y = Math.max(bounds.top, Math.min(bounds.bottom, body.y + (i === 2 ? -170 : 140)));
    });
    state.started = true;
  }
  for (const a of state.agents) {
    // Re-enter the current view after a scroll instead of chasing from another screen.
    a.x = Math.max(bounds.left, Math.min(bounds.right, a.x));
    a.y = Math.max(bounds.top, Math.min(bounds.bottom, a.y));
    const dx = body.x - a.x, dy = body.y - a.y, distance = Math.hypot(dx, dy) || 1;
    const chase = Math.max(-30, Math.min(90, (distance - 125) * .65));
    const orbit = Math.sin(state.time * .65 + a.phase) * 22;
    let separateX = 0, separateY = 0;
    for (const other of state.agents) {
      if (other === a) continue;
      const sx = a.x - other.x, sy = a.y - other.y, apart = Math.hypot(sx, sy);
      if (apart > 0 && apart < 65) {
        separateX += sx / apart * (65 - apart); separateY += sy / apart * (65 - apart);
      }
    }
    a.vx += ((dx / distance * chase - dy / distance * orbit + separateX) - a.vx) * Math.min(1, step * 4);
    a.vy += ((dy / distance * chase + dx / distance * orbit + separateY) - a.vy) * Math.min(1, step * 4);
    a.x = Math.max(bounds.left, Math.min(bounds.right, a.x + a.vx * step));
    a.y = Math.max(bounds.top, Math.min(bounds.bottom, a.y + a.vy * step));
    a.aim = Math.atan2(body.y - 8 - a.y, body.x - a.x);
    a.flash = Math.max(0, a.flash - step);
    a.cooldown -= step;
    if (a.cooldown <= 0 && distance > 60 && state.bullets.length < BULLET_LIMIT) {
      // Aim at where Neo was when the trigger was pulled; movement can evade it.
      const angle = a.aim + Math.sin(state.time * 3 + a.phase) * .055;
      const ux = Math.cos(angle), uy = Math.sin(angle);
      const x = a.x + ux * 24, y = a.y - 4 + uy * 24;
      state.bullets.push({ x, y, px: x, py: y, vx: ux * 260, vy: uy * 260, life: 4, hits: 0, grazed: false });
      a.flash = .13; a.cooldown = 1.4 + (Math.sin(a.phase + state.time) + 1) * .35;
    }
  }
  const segments = [];
  for (const b of state.bullets) {
    b.px = b.x; b.py = b.y;
    b.x += b.vx * step; b.y += b.vy * step; b.life -= step;
    if (!b.grazed && segmentDistance(body.x, body.y - 8, b) < 13) {
      b.grazed = true;
      if (!dodging && state.time - state.hitAt > .5) state.hitAt = state.time;
    }
    if (b.life > 0 && b.x >= bounds.left - 60 && b.x <= bounds.right + 60 && b.y >= bounds.top - 60 && b.y <= bounds.bottom + 60) segments.push(b);
  }
  state.bullets = segments;
  return segments;
}

function pixels(shape, palette, unit, centerY, neo = false) {
  return shape.flatMap((row, y) => [...row].flatMap((c, x) => c === ' ' ? [] : [{
    x: (x - 7) * unit, y: (y - centerY) * unit, z: 30, color: palette[c], size: unit + .1,
    eye: c === 'g', leg: y >= (neo ? 24 : 21) ? (x < 7 ? -1 : 1) : 0,
    upper: y < 18, coat: c === 'c' || c === 'l',
  }]));
}

export function neoPixels() {
  return pixels([
    '      hhhh     ', '     hhhhhh    ', '    hhhhhhh    ', '    hfffffh    ',
    '    sgsfsgs    ', '    ffffffh    ', '     ffffh     ', '      fff      ',
    '     csssc     ', '    ccssscc    ', '   cclssslcc   ', '   cclssslcc   ',
    '   cclssslcc   ', '   cclssslcc   ', '   fclssslcf   ', '   fclssslcf   ',
    '    clssscc    ', '    clssscc    ', '   cclsssccc   ', '   cclsssccc   ',
    '   cclsssccc   ', '  ccclssscccc  ', '  ccc ss cccc  ', '  cc  ss  ccc  ',
    '      ss ss    ', '      ss ss    ', '     sss sss   ',
  ], { h: '#111819', s: '#111819', c: '#202729', l: '#3c4746', f: '#dfc6af', g: '#98b9b5' }, 2.1, 13, true);
}

export function agentPixels() {
  const home = pixels([
    '     hhhhh     ', '    hhhhhhh    ', '    hfffffh    ', '    sgsssgs    ',
    '    fffffff    ', '     fffff     ', '      fff      ', '    ccwtwcc    ',
    '   cccwtwccc   ', '   cclwtwlcc   ', '   cclwtwlcc   ', '   cclctclcc   ',
    '   cclctclcc   ', '   fccltlccf   ', '   fccctcccf   ', '    ccccccc    ',
    '    ccccccc    ', '    ccccccc    ', '     cc cc     ', '     cc cc     ',
    '     cc cc     ', '     tt tt     ', '    ttt ttt    ',
  ], { h: '#45463f', f: '#d6b99e', c: '#454e4e', l: '#677371', w: '#eceee4', t: '#1b2427', s: '#20272a', g: '#9badab' }, 2, 11);
  // The sleeve and pistol rotate independently to aim at the player.
  for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) home.push({ x: 7 + x * 2, y: y * 2, z: 31, color: x < 4 ? '#454e4e' : x < 5 ? '#d6b99e' : '#20272a', size: 2.1, arm: true });
  for (const [x, y] of [[25, 1], [28, -2], [28, 4]]) home.push({ x, y, z: 34, color: '#f5d590', size: 3, flash: true, opacity: 0 });
  return home;
}
