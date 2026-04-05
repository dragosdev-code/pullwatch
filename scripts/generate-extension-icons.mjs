/**
 * Build Chrome toolbar/manifest icon sizes from the full-res master in public/.
 *
 * Source (never modified): logo.png — any resolution; read by sharp (PNG, WebP, etc.).
 * Outputs (true PNG): logo-16.png, logo-32.png, logo-48.png, logo-128.png
 *
 * Does not write or resize logo.png. Notifications use logo-128.png via
 * extension/common/extension-assets.ts (regenerate after logo.png changes).
 *
 * Usage: node scripts/generate-extension-icons.mjs
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pub = join(__dirname, '..', 'public');

const SOURCE = join(pub, 'logo.png');
const SIZES = [16, 32, 48, 128];

async function main() {
  const meta = await sharp(SOURCE).metadata();
  if (!meta.width || !meta.height) throw new Error('Could not read source dimensions');

  for (const size of SIZES) {
    const buf = await sharp(SOURCE)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: sharp.kernel.lanczos3,
      })
      .ensureAlpha()
      .png({ compressionLevel: 9 })
      .toBuffer();
    const name = join(pub, `logo-${size}.png`);
    writeFileSync(name, buf);
    console.log('Wrote', `logo-${size}.png`, `${size}×${size}`);
  }

  console.log('Source unchanged:', SOURCE, `(${meta.format}, ${meta.width}×${meta.height})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
