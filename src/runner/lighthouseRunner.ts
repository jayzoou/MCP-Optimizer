export async function runLighthouseAudit(
  url: string,
  opts?: { emulateMobile?: boolean; categories?: string[] }
): Promise<any> {
  // Use the Lighthouse CLI via `npx` to avoid importing the ESM-only
  // Lighthouse package into this CommonJS runtime.
  const dynamicImport = new Function('specifier', 'return import(specifier)');
  const chromeLauncherModule = await (dynamicImport as any)('chrome-launcher');
  const chromeLauncher = (chromeLauncherModule && (chromeLauncherModule.default ?? chromeLauncherModule)) as any;
  const { execFile } = await (dynamicImport as any)('node:child_process');

  const os = await (dynamicImport as any)('node:os');
  const pathMod = await (dynamicImport as any)('node:path');
  const tmpDir = pathMod.join(os.tmpdir(), `lighthouse-${Date.now()}-${Math.random().toString(36).slice(2,6)}`);
  const fs = await (dynamicImport as any)('node:fs');
  fs.mkdirSync(tmpDir, { recursive: true });
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'], userDataDir: tmpDir });
  try {
    const port = chrome.port;
    const args: string[] = [
      'lighthouse',
      url,
      `--port=${port}`,
      '--output=json',
      '--quiet'
    ];
    if (opts?.emulateMobile) args.push('--preset=mobile');
    if (opts?.categories && opts.categories.length) args.push(`--only-categories=${opts.categories.join(',')}`);

    // Run via npx to ensure local package is used
    const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

    const reportJson: string = await new Promise((resolve, reject) => {
      execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024 }, (err: any, stdout: string, stderr: string) => {
        if (err) {
          const message = stderr || (err && err.message) || String(err);
          return reject(new Error(message));
        }
        resolve(stdout);
      });
    });

    // The CLI returns a JSON string containing the report and LHR; parse it
    const parsed = JSON.parse(reportJson);
    // Lighthouse CLI places the LHR inside `lhr` when output=json
    const lhr = parsed.lhr ?? parsed;
    return { lhr, report: parsed };
  } catch (err: any) {
    // If anything goes wrong launching Chrome or running Lighthouse,
    // return a minimal error-shaped report so the MCP server can continue
    // to respond and surface the error to callers instead of crashing.
    const message = (err && (err.stack || err.message)) || String(err);
    return {
      lhr: { categories: {} },
      report: { error: message },
      error: message
    };
  } finally {
    try {
      await chrome.kill();
    }
    catch (_) {
      // ignore cleanup errors
    }
  }
}
