import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Single source of truth for Vite resolve.alias and Vitest resolve.alias.
 * Keys match tsconfig `paths` (@alias → filesystem root, subpaths appended).
 */
export const viteResolveAliases: Record<string, string> = {
  '@extension': path.resolve(__dirname, 'extension'),
  '@common': path.resolve(__dirname, 'extension/common'),
  '@background': path.resolve(__dirname, 'extension/background'),
  '@offscreen': path.resolve(__dirname, 'extension/offscreen'),
  '@debug': path.resolve(__dirname, 'extension/debug'),
  '@src': path.resolve(__dirname, 'src'),
};
