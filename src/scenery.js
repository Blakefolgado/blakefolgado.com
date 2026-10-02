// A small pixel atlas: the same sky, scattered differently on each visit.
export function makeScenery(width, height, projects, seed) {
  const land = [], sky = [], water = [];
  const random = i => { const v = Math.sin(seed + i * 12.9898) * 43758.5453; return v - Math.floor(v); };
  const clear = (x, y, radius) => !projects.some(p =>
    (Math.abs(x - p.x) < 145 + radius && y > p.y - 35 - radius && y < p.y + 68 + radius) ||
    (Math.abs(x - p.x) < 43 + radius && Math.abs(y - (p.y - 70)) < 42 + radius));
  const occupied = [];
  const palette = { w: '#e3f3fb', b: '#409ce1', d: '#5769a2', p: '#ae8ddd', r: '#ef8f78', y: '#ffc564', t: '#55cbb8' };
  const sprites = [
    null, null,
    ['        b        ', '       bbb       ', '      bbbbb      ', 'ddddddddddddddddw', ' wwwwwwwwwwwwwww ', '      wwwww      ', '       www       ', '        w        '],
    ['       www       ', '     wwbbbww     ', '   ddwwbbbwwdd   ', ' ddddddddddddddd ', '   ppppppppppp   ', '     y  y  y     '],
    null,
    ['      rr      ', '     rwwr     ', '    rwbbwr    ', '    rwbbwr    ', '    rwwwwr    ', '   rrwwwwrr   ', '  rrrwwwwrrr  ', '     yyyy     ', '      yy      '],
    ['         w       ', '       www       ', '     wwwww       ', '   wwwbbbwwww    ', ' ddddddddddddddd ', '       ddd       ', '        d        '],
  ];
  sprites.forEach((sprite, index) => {
    const unit = width < 650 ? 2 : 3;
    const radius = 11 * unit;
    let center;
    for (let attempt = 0; attempt < 120; attempt++) {
      const x = radius + 15 + random(index * 80 + attempt) * (width - radius * 2 - 30);
      const y = attempt < 60
        ? 40 + index * (height - 440) / 7 + random(index * 80 + attempt + 700) * 110
        : 40 + random(index * 80 + attempt + 700) * (height - 400);
      if (clear(x, y, radius) && occupied.every(p => Math.hypot(x - p.x, y - p.y) > radius * 2 + 25)) {
        center = { x, y }; break;
      }
    }
    if (!center) return;
    occupied.push(center);
    const pixel = (x, y, color) => sky.push({ x: center.x + x * unit, y: center.y + y * unit, z: 0, color, size: unit * .85, opacity: .85, phase: index * 1.7 });
    if (sprite) {
      sprite.forEach((row, y) => [...row].forEach((c, x) => { if (c !== ' ') pixel(x - (row.length - 1) / 2, y - sprite.length / 2, palette[c]); }));
    } else {
      for (let y = -9; y <= 9; y++) for (let x = -11; x <= 11; x++) {
        const disc = x * x + y * y <= 49;
        if (index === 0) {
          const ray = (x === 0 || y === 0 || Math.abs(x) === Math.abs(y)) && x * x + y * y > 70 && x * x + y * y < 105;
          if (disc || ray) pixel(x, y, x + y < -2 ? '#ffcc67' : '#f4a44d');
        } else if (index === 1) {
          if (disc && (x - 4) ** 2 + (y + 3) ** 2 > 44) pixel(x, y, x < -3 ? '#a49ad8' : '#c5b8f0');
        } else {
          const ring = Math.abs(y + x * .33) < 1.2 && Math.abs(x) > 5 && Math.abs(x) < 11;
          if (disc || ring) pixel(x, y, ring ? '#e69f8e' : y < -2 ? '#f8cbb0' : y < 3 ? '#eeb495' : '#d99997');
        }
      }
    }
  });
  for (let i = 0; i < Math.round(width * .23); i++) {
    const x = 12 + random(i + 1500) * (width - 24), y = 16 + random(i + 2100) * (height - 320);
    if (!clear(x, y, 8) || occupied.some(p => Math.hypot(x - p.x, y - p.y) < 40)) continue;
    const color = ['#789ecc', '#a782cd', '#e4a447', '#65b4a5'][i % 4];
    const point = (dx, dy, size) => sky.push({ x: x + dx, y: y + dy, z: 0, color, size, opacity: .65 + random(i + 2700) * .25, phase: i * .8, star: true });
    point(0, 0, i % 7 === 0 ? 4 : 2.8);
    if (i % 7 === 0) for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) point(dx, dy, 2.3);
  }
  for (let x = 0; x < width; x += 4) {
    const mountain = Math.max(0, 185 - Math.abs(x - width * .12) * .8, 140 - Math.abs(x - width * .86) * .7);
    const ridge = height - 170 - mountain;
    const hill = height - 157 - 33 * Math.sin(x / width * 6 + seed);
    for (let y = Math.round(ridge / 4) * 4; y < height - 112; y += 4) {
      const behind = y < hill;
      const snow = behind && mountain > 90 && y < ridge + 20;
      land.push({ x, y, z: 0, color: snow ? '#c7d8ec' : behind ? '#8d9fd0' : y < hill + 24 ? '#8ac878' : '#5ba985', size: 3, opacity: snow ? .8 : behind ? .62 : .78 });
    }
    for (let y = 0; y < 130; y += 4) {
      water.push({ x, y: height - 130 + y, z: 1, color: y < 20 ? '#55c9bc' : y < 64 ? '#24acbb' : '#398dca', size: 3.2, opacity: 0 });
    }
  }
  return { land, sky, water };
}
