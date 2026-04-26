import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

export function serveCommand(options: { port?: string }) {
  const port = options.port ?? '3000';
  const webDir = resolve(process.cwd(), 'apps/web');

  console.log(`启动 Web UI (端口: ${port})...`);
  process.env.PORT = port;
  execSync(`npx next dev --port ${port}`, {
    cwd: webDir,
    stdio: 'inherit',
  });
}
