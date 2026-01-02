export async function runLighthouseAudit(
  url: string,
  opts?: { emulateMobile?: boolean; categories?: string[] }
): Promise<any> {
  const lhModule = await import('lighthouse');
  const lighthouse = (lhModule && (lhModule.default ?? lhModule)) as any;
  const chromeLauncherModule = await import('chrome-launcher');
  const chromeLauncher = (chromeLauncherModule && (chromeLauncherModule.default ?? chromeLauncherModule)) as any;

  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
  try {
    const flags: any = { port: chrome.port, output: 'json' };
    const config: any = { settings: {} };

    if (opts?.emulateMobile) {
      config.settings.formFactor = 'mobile';
    } else {
      config.settings.formFactor = 'desktop';
    }

    if (opts?.categories && opts.categories.length) {
      config.settings.onlyCategories = opts.categories;
    }

    const runnerResult = await lighthouse(url, flags, config);
    return { lhr: runnerResult.lhr, report: runnerResult.report };
  } finally {
    await chrome.kill();
  }
}
