const palette = { w: '#fff0cf', m: '#7a6455', o: '#e89b62', r: '#da7764', b: '#4d76a5', t: '#aadfd0', s: '#e9c8a0', h: '#634e40', e: '#334a4a' };

export function marineSprites(width, height) {
  const sail = ['      m      ', '     wm      ', '    wwm      ', '   wwwm      ', '  wwwwm      ', ' wwwwwm      ', 'wwwwwwm      ', '      m      ', '      m      ', ' ooooooooooo ', '  ooooooooo  ', '   mmmmmmm   '];
  const boat = ['     bbbb        ', '     bwwb        ', '   bbbbbbb       ', '   bwwbwwb       ', '   bbbbbbb       ', ' rrrrrrrrrrrrrrr ', '  rrrrrrrrrrrrr  ', '   mmmmmmmmmmm   '];
  const fish = ['      oo ', ' oo oooo ', 'oooeooooo', ' oo oooo ', '      oo '];
  const surfer = ['       hh        ', '       ss        ', '      ssss       ', '       rr        ', '     srrrrss     ', '       rr        ', '       rr        ', '      rrr        ', '     ss ss       ', '    ss   ss      ', ' ttttttttttttttt ', 'ttttttttttttttttt'];
  const make = (kind, shape, fraction, depth, phase, unit) => ({
    kind, x: width * fraction, y: height - depth, baseX: width * fraction, depth, phase, vx: 0, escape: 0,
    lastKnock: -100, side: 1, hovered: false,
    home: shape.flatMap((row, y) => [...row].flatMap((c, x) => c === ' ' ? [] : [{ x: (x - (shape[0].length - 1) / 2) * unit, y: (y - shape.length + 2) * unit, z: 20, color: palette[c], size: unit + .1, rider: kind === 'surfer' && y < 10 }])),
  });
  return [
    make('boat', sail, .12, 100, 0, 2.2),
    make('boat', boat, .86, 94, 2, 2.2),
    make('surfer', surfer, .5, 71, 1, 2.1),
    ...Array.from({ length: width < 650 ? 3 : 5 }, (_, i) => make('fish', fish, (i + .5) / (width < 650 ? 3 : 5), 25 + i % 2 * 17, i * 1.9, 1.5)),
  ];
}

export function knockSurfer(creature, time, direction = 1) {
  if (creature.kind !== 'surfer' || time - creature.lastKnock < 3.8) return false;
  creature.lastKnock = time; creature.side = direction;
  return true;
}

export function stepMarine(creature, dt, time, width, height, pointer, body, reduced) {
  const near = point => point && Math.hypot(point.x - creature.x, point.y - creature.y + 10) < 27;
  const hovered = !!near(pointer), bumped = Math.hypot(body.x - creature.x, body.y - creature.y) < 23 && Math.hypot(body.vx, body.vy) > 35;
  const knocked = !reduced && (hovered && !creature.hovered || bumped) && knockSurfer(creature, time, (pointer?.x ?? body.x) < creature.x ? 1 : -1);
  creature.hovered = hovered;
  let rotation = 0, fall = 0, direction = 1;
  if (!reduced) {
    if (creature.kind === 'fish') {
      const dx = creature.x - (pointer?.x ?? -1000), dy = creature.y - (pointer?.y ?? -1000);
      if (Math.hypot(dx, dy) < 65) creature.escape += (dx < 0 ? -1 : 1) * 180 * dt;
      creature.escape *= Math.exp(-3 * dt);
      const raw = creature.baseX + time * (12 + creature.phase * 2) + creature.escape;
      creature.x = ((raw + 20) % (width + 40) + width + 40) % (width + 40) - 20;
      direction = creature.escape < -4 ? -1 : 1;
    } else {
      const home = creature.baseX + Math.sin(time * .35 + creature.phase) * (creature.kind === 'boat' ? 12 : 22);
      if (hovered && creature.kind === 'boat') creature.vx += (creature.x < pointer.x ? -1 : 1) * 150 * dt;
      creature.vx += ((home - creature.x) * 14 - creature.vx * 5) * dt;
      creature.x = Math.max(20, Math.min(width - 20, creature.x + creature.vx * dt));
      rotation = Math.sin(time * 1.4 + creature.phase) * .07;
    }
    creature.y = height - creature.depth + Math.sin(time * 1.7 + creature.phase) * 3;
    const age = time - creature.lastKnock;
    if (creature.kind === 'surfer' && age < 3.3) fall = Math.min(1, age / .2) * Math.max(0, Math.min(1, (3.3 - age) / 1.3));
  } else { creature.x = creature.baseX; creature.y = height - creature.depth; }
  return { x: creature.x, y: creature.y, rotation, fall, direction, knocked };
}
