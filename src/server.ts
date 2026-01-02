import * as http from 'http';
import { runLighthouseAudit } from './runner/lighthouseRunner';
import { autoFixFromReport } from './fix/fixer';

export async function startHttpServer(port?: number): Promise<http.Server> {
  const p = Number(port ?? process.env.PORT ?? process.env.AUDIT_PORT ?? 5000);

  const requestHandler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (req.method === 'POST' && req.url === '/audit') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      const parsed = JSON.parse(body || '{}');
      const url = parsed.url as string | undefined;
      if (!url) {
        res.writeHead(400);
        res.end('missing url');
        return;
      }
      try {
        const report = await runLighthouseAudit(url);
        const fix = await autoFixFromReport(report);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ summary: report.lhr?.categories || null, fix }));
      } catch (err: any) {
        res.writeHead(500);
        res.end(String(err));
      }
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('MCP Optimizer running — POST /audit { "url": "https://..." }');
    }
  };

  const server = http.createServer(requestHandler);

  return new Promise((resolve, reject) => {
    server.listen(p, () => {
      console.log(`Server listening on ${p}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}
