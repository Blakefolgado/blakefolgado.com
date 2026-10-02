import { cp, mkdir } from 'node:fs/promises';

// Client files only. API code and credentials never enter the static output.
await mkdir('dist/vendor', { recursive: true });
for (const file of ['index.html', 'src', 'assets', 'og.png']) {
  await cp(file, `dist/${file}`, { recursive: true });
}
for (const file of ['three.module.js', 'three.core.js']) {
  await cp(`node_modules/three/build/${file}`, `dist/vendor/${file}`);
}
console.log('Built the pixel garden in dist/');
