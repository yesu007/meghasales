import { defineConfig } from 'vitest/config';
import path from 'path';

// Existing tests only ever import via relative paths, so this alias has
// never been needed before — the assistant module (src/lib/assistant) is
// the first to import other @/-aliased modules (rbac, auth) from a test.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
