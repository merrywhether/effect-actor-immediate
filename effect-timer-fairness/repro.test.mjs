import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const worker = fileURLToPath(new URL('./worker.mjs', import.meta.url));
for (const mode of ['after', 'timeout']) {
  test(`${mode} makes progress during continuous internal traffic`, async () => {
    const child = spawn(process.execPath, [worker, mode], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    let timedOut = false;
    const watchdog = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 3000);
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    }).finally(() => clearTimeout(watchdog));
    assert.equal(timedOut, false, `external watchdog: ${mode} made no progress within 3 seconds`);
    assert.equal(result.code, 0, `worker failed (${result.signal ?? result.code}): ${stderr}`);
  });
}
