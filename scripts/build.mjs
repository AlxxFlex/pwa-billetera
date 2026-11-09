import { mkdir, copyFile, cp, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
await mkdir(output, { recursive: true });
const files = ['index.html', 'styles.css', 'app.js', 'storage.js', 'sw.js', 'manifest.json'];
for (const file of files) await copyFile(path.join(root, file), path.join(output, file));
await cp(path.join(root, 'icons'), path.join(output, 'icons'), { recursive: true });
const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
for (const icon of manifest.icons) await readFile(path.resolve(output, icon.src));
console.log('Build listo: dist/ · HTML, CSS, JS, manifest e íconos. Sin dependencias externas.');
