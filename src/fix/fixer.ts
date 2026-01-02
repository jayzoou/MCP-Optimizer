export async function autoFixFromReport(report: any, opts?: { onlyFailures?: boolean }): Promise<any> {
  const performance = report.lhr?.categories?.performance || null;
  const audits = report.lhr?.audits || {};
  let failures: any = null;
  if (opts?.onlyFailures) {
    failures = Object.fromEntries(
      Object.entries(audits).filter(([, v]: any) => {
        const score = v && (v.score ?? v.scoreDisplayMode === 'notApplicable' ? 1 : v.score);
        return typeof score === 'number' ? score < 1 : false;
      })
    );
  }
  return {
    suggestion: 'Review performance opportunities and apply targeted fixes',
    performance,
    failures,
  };
}
