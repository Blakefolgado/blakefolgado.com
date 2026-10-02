// Semi-implicit spring integration; the caller caps the frame step after a pause.
export function walk(body, target, dt, width, height) {
  const step = Math.min(dt, 1 / 30);
  body.vx += ((target.x - body.x) * 32 - body.vx * 7.8) * step;
  body.vy += ((target.y - body.y) * 32 - body.vy * 7.8) * step;
  const speed = Math.hypot(body.vx, body.vy);
  const limit = 390;
  if (speed > limit) { body.vx *= limit / speed; body.vy *= limit / speed; }
  body.x = Math.max(20, Math.min(width - 20, body.x + body.vx * step));
  body.y = Math.max(35, Math.min(height - 40, body.y + body.vy * step));
}

export function layout(width, height, seed = 0) {
  const edge = Math.min(140, width * .36);
  return [.58, .29, .69, .34, .66, .28, .55].map((x, index) => ({
    x: Math.max(edge, Math.min(width - edge, width * (x + Math.sin(seed + index * 7.3) * .055))),
    y: 120 + index * (height - 240) / 6 + Math.sin(seed * .7 + index * 2.4) * 10,
  }));
}

export function gaze(x, y, pointer) {
  if (!pointer) return { x: 0, y: 0 };
  const dx = pointer.x - x, dy = pointer.y - y;
  const distance = Math.max(80, Math.hypot(dx, dy));
  return { x: dx / distance * 1.7, y: dy / distance * 1.2 };
}

// Keep sea hit testing on the same moving shoreline that we draw.
export function seaSurface(x, height, time = 0) {
  return height - 124 + Math.sin(x * .017 + time * .8) * 5 + Math.sin(x * .037 - time * .55) * 3;
}
