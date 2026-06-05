/**
 * Build a Chrome Web Store upload zip from dist/.
 *
 * Prerequisites: `npm run build` (or run via `npm run zip`, which builds first).
 *
 * Output: pullwatch.zip at repo root with manifest.json at the zip root
 * (contents of dist/, not a nested dist/ folder).
 *
 * Excluded from the store package (not needed at runtime):
 * - pullwatch-view.gif — README/marketing demo only
 * - stats.html — bundle analyzer output from `npm run build:analyze`
 * - *.map — source maps if present
 */
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const outZip = join(root, 'pullwatch.zip');

const manifest = join(dist, 'manifest.json');
if (!existsSync(manifest)) {
  console.error('dist/manifest.json not found. Run `npm run build` first.');
  process.exit(1);
}

if (existsSync(outZip)) {
  unlinkSync(outZip);
}

const excludeArgs = [
  '-x',
  'pullwatch-view.gif',
  '-x',
  'stats.html',
  '-x',
  '*.map',
].join(' ');

function tryZipCli() {
  execSync(`zip -r "${outZip}" . ${excludeArgs}`, { cwd: dist, stdio: 'inherit' });
}

function zipWithPowerShell() {
  const ps = [
    '$exclude = @("pullwatch-view.gif", "stats.html")',
    `$dist = ${JSON.stringify(dist)}`,
    `$out = ${JSON.stringify(outZip)}`,
    '$files = Get-ChildItem -Path $dist -Force | Where-Object {',
    '  $exclude -notcontains $_.Name -and $_.Name -notlike "*.map"',
    '}',
    'if (Test-Path $out) { Remove-Item $out -Force }',
    '$files | Compress-Archive -DestinationPath $out -CompressionLevel Optimal',
  ].join('; ');
  execSync(`powershell -NoProfile -Command ${JSON.stringify(ps)}`, { stdio: 'inherit' });
}

try {
  execSync('zip -v', { stdio: 'ignore' });
  tryZipCli();
} catch {
  if (process.platform === 'win32') {
    zipWithPowerShell();
  } else {
    console.error(
      'The `zip` command was not found. Install zip (e.g. apt install zip) or run on Windows with PowerShell.',
    );
    process.exit(1);
  }
}

console.log(`\nCreated ${outZip}`);
