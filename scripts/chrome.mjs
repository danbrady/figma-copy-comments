// Starts the browser that scripts/listing.mjs and scripts/visual-qa/run.mjs render with:
// the installed Google Chrome, or the browser at CHROME_PATH. playwright-core downloads no
// browser of its own, so when none is found this says what to do instead of a stack trace.
import { chromium } from 'playwright-core';

export async function launchChrome() {
  const path = process.env.CHROME_PATH;
  try {
    return await chromium.launch(path ? { executablePath: path } : { channel: 'chrome' });
  } catch (err) {
    console.error(path
      ? 'Couldn’t start the browser at CHROME_PATH (' + path + '). Check the path, or unset CHROME_PATH to use Google Chrome.'
      : 'Couldn’t start Google Chrome. Install it from https://www.google.com/chrome/, or set CHROME_PATH to another Chromium-based browser.');
    console.error('Details: ' + String(err && err.message || err).split('\n')[0]);
    process.exit(1);
  }
}
