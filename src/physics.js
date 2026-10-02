// Semi-implicit spring integration; the caller caps the frame step after a pause.
export function walk(body, target, dt, width, height, limit = 390) {
  const step = Math.min(dt, 1 / 30);
  body.vx += ((target.x - body.x) * 32 - body.vx * 7.8) * step;
  body.vy += ((target.y - body.y) * 32 - body.vy * 7.8) * step;
  const speed = Math.hypot(body.vx, body.vy);
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

export function visibleBounds(rect, viewport) {
  const left = Math.max(0, -rect.left), right = Math.min(rect.width, viewport.width - rect.left);
  const top = Math.max(0, -rect.top), bottom = Math.min(rect.height, viewport.height - rect.top);
  if (right <= left || bottom <= top) return null;
  const px = Math.min(44, (right - left) / 2), py = Math.min(44, (bottom - top) / 2);
  return { left: left + px, right: right - px, top: top + py, bottom: bottom - py };
}

export function keepInView(body, target, bounds) {
  const clampX = x => Math.max(bounds.left, Math.min(bounds.right, x));
  const clampY = y => Math.max(bounds.top, Math.min(bounds.bottom, y));
  const x = clampX(body.x), y = clampY(body.y);
  if (x !== body.x) body.vx = 0;
  if (y !== body.y) body.vy = 0;
  body.x = x; body.y = y;
  target.x = clampX(target.x); target.y = clampY(target.y);
}

// Move the view with keyboard travel before the visible edge clips the character.
export function keyboardPan(body, direction, bounds, dt, height) {
  if (!bounds || !direction) return 0;
  const edge = direction > 0 ? bounds.bottom - body.y : body.y - bounds.top;
  const room = direction > 0 ? height - 44 - bounds.bottom : bounds.top - 44;
  if (edge > 60 || room <= 0) return 0;
  return Math.sign(direction) * Math.min(room, Math.max(120, body.vy * Math.sign(direction)) * Math.min(dt, 1 / 30));
}

export function wanderTarget(body, bounds, landmarks, random = Math.random) {
  const visible = landmarks.filter(p => p.y > bounds.top + 80 && p.y < bounds.bottom - 70);
  const visit = visible.length && random() < .55 ? visible[Math.floor(random() * visible.length)] : null;
  const x = visit ? visit.x + (random() < .5 ? -120 : 120) : body.x + (random() - .5) * 300;
  const y = visit ? visit.y - 65 : body.y + (random() - .5) * 250;
  return { x: Math.max(bounds.left, Math.min(bounds.right, x)), y: Math.max(bounds.top, Math.min(bounds.bottom, y)) };
}
