#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadProjectEnv } from '../server/runtime/loadProjectEnv.js';
import { buildElectronDevCsp } from './lib/electronDevCsp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const viteCli = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const electronCli = path.join(projectRoot, 'node_modules', 'electron', 'cli.js');

loadProjectEnv();

const viteHost = process.env.ELECTRON_VITE_HOST ?? '127.0.0.1';
const vitePort = Number.parseInt(process.env.ELECTRON_VITE_PORT ?? '5173', 10);
const startUrl = `http://${viteHost}:${vitePort}`;

function spawnNodeProcess(scriptPath, args, env) {
  return spawn(process.execPath, [scriptPath, ...args], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  });
}

async function waitForUrl(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The dev server is still starting up.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for Vite dev server at ${url}`);
}

let shuttingDown = false;
function terminate(child) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }
  child.kill('SIGTERM');
}

async function main() {
  const sharedEnv = {
    ...process.env,
    PATH: process.env.PATH,
    VITE_APP_CSP: buildElectronDevCsp({
      host: viteHost,
      baseCsp: process.env.VITE_APP_CSP,
    }),
    // Register tsx/esm so Electron's main process can load .ts server modules.
    NODE_OPTIONS: `--import tsx/esm${process.env.NODE_OPTIONS ? ` ${process.env.NODE_OPTIONS}` : ''}`,
  };
  delete sharedEnv.ELECTRON_RUN_AS_NODE;

  const viteProcess = spawnNodeProcess(
    viteCli,
    ['--host', viteHost, '--port', String(vitePort), '--strictPort'],
    sharedEnv
  );

  const cleanup = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    terminate(viteProcess);
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });

  viteProcess.once('exit', (code) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    process.exit(code ?? 1);
  });

  await waitForUrl(startUrl);

  const electronProcess = spawnNodeProcess(electronCli, ['electron'], {
    ...sharedEnv,
    ELECTRON_START_URL: startUrl,
  });

  electronProcess.once('exit', (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
