import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const manifestPath = path.join(repoRoot, 'manifest.json');
const checkOnly = process.argv.includes('--check');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const contentScripts = Array.isArray(manifest.content_scripts)
  ? manifest.content_scripts.filter((entry) => {
      const scripts = Array.isArray(entry?.js) ? entry.js : [];
      return !scripts.includes('youtube-pip.js');
    })
  : [];

contentScripts.push({
  matches: ['*://*.youtube.com/*'],
  js: ['youtube-pip.js'],
  run_at: 'document_idle',
  all_frames: false,
  world: 'MAIN',
});

manifest.content_scripts = contentScripts;
manifest.version = '1.29.1.2';
manifest.version_name = '1.29.1-maint.2';

const expected = `${JSON.stringify(manifest, null, 2)}\n`;
const current = fs.readFileSync(manifestPath, 'utf8');
const matchesCanonicalManifest =
  JSON.stringify(JSON.parse(current)) === JSON.stringify(manifest);

if (checkOnly) {
  if (!matchesCanonicalManifest) {
    console.error('manifest.json does not contain the canonical YouTube PiP registration');
    process.exitCode = 1;
  }
} else if (!matchesCanonicalManifest) {
  fs.writeFileSync(manifestPath, expected);
  console.log('Registered youtube-pip.js in manifest.json');
} else {
  console.log('YouTube PiP manifest patch already applied');
}
