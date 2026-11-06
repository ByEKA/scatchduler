import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Writes third-party-licenses.txt into the build's output folder after every build (P3 core spec
// §3, S10), so dist/, dist-e2e/ and dist-supabase/ each serve it at /third-party-licenses.txt.
// `apply: 'build'` keeps it out of the dev server and Vitest.
function thirdPartyLicenses(): Plugin {
  let outDir = '';
  return {
    name: 'third-party-licenses',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const script = fileURLToPath(new URL('./scripts/third-party-licenses.mjs', import.meta.url));
      execFileSync(process.execPath, [script, outDir], { stdio: 'inherit' });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), thirdPartyLicenses()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
