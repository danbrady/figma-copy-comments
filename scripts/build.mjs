// Builds the plugin into dist/ with esbuild:
//   src/code.ts -> dist/code.js   (main thread, one script)
//   src/ui.ts   -> inlined into dist/ui.html, because a plugin's UI is a single HTML file
// Flags: --watch rebuilds on change; --with-tests also builds dist/test/logic.cjs for the unit tests.
import * as esbuild from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { watch as watchFile } from 'node:fs';

const watch = process.argv.includes('--watch');
const withTests = process.argv.includes('--with-tests');
const common = { bundle: true, target: 'es2017', charset: 'utf8', logLevel: watch ? 'info' : 'warning' };
const PLACEHOLDER = '<!-- ui.ts is inlined here by scripts/build.mjs -->';

// Writes dist/ui.html: the template with the bundled script in place of the placeholder.
const inlineUi = {
  name: 'inline-ui',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length) return;
      const template = await readFile('src/ui.html', 'utf8');
      if (!template.includes(PLACEHOLDER)) throw new Error('src/ui.html is missing the script placeholder');
      // A literal "</script" inside the bundle would end the tag early.
      const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
      await mkdir('dist', { recursive: true });
      await writeFile('dist/ui.html', template.replace(PLACEHOLDER, () => '<script>\n' + js + '</script>'));
    });
  },
};

const builds = [
  { ...common, entryPoints: ['src/code.ts'], outfile: 'dist/code.js', format: 'iife' },
  { ...common, entryPoints: ['src/ui.ts'], outfile: 'dist/ui.js', format: 'iife', write: false, plugins: [inlineUi] },
];
if (withTests) {
  builds.push({ ...common, entryPoints: ['src/logic.ts'], outfile: 'dist/test/logic.cjs', format: 'cjs', platform: 'node' });
}

if (watch) {
  const contexts = await Promise.all(builds.map((options) => esbuild.context(options)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  // The HTML template isn't imported by any script, so watch it separately.
  watchFile('src/ui.html', () => contexts[1].rebuild().catch(() => {}));
  console.log('Watching src/ for changes…');
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
