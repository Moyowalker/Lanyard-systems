import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const appRequire = createRequire(pathToFileURL(path.join(process.cwd(), 'package.json')));
const nextBin = appRequire.resolve('next/dist/bin/next');

const [, , fallbackPort = '3000', ...extraArgs] = process.argv;
const port = process.env.PORT ?? fallbackPort;
const host = process.env.HOST ?? '0.0.0.0';

const child = spawn(process.execPath, [nextBin, 'start', '--hostname', host, '--port', port, ...extraArgs], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});