import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runLighthouseAudit } from "./runner/lighthouseRunner";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import * as http from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import { autoFixFromReport } from './fix/fixer';

export class LighthouseMcpServer {
  private readonly server: McpServer;
  private readonly reports: Map<string, any> = new Map();

  constructor() {
    this.server = new McpServer({ name: "Lighthouse MCP Server", version: "0.1.0" });
    this.registerTools();
  }

  /**
   * Run an audit and store the report. Returns stored record.
   */
  public async runAudit(options: { url: string; categories?: string[]; formFactor?: 'mobile' | 'desktop' }) {
    const { url, categories, formFactor } = options;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const opts: any = {};
    if (categories && categories.length > 0) opts.categories = categories;
    if (formFactor === 'mobile') opts.emulateMobile = true;

    const runnerResult = await runLighthouseAudit(url, opts);
    const reportJson = runnerResult.report;
    const lhr = runnerResult.lhr;

    const record = {
      id,
      url,
      fetchedAt: new Date().toISOString(),
      lhr,
      report: JSON.parse(reportJson)
    };

    this.reports.set(id, record);
    return record;
  }

  private registerTools(): void {
    this.server.tool(
      "lighthouse_run_audit",
      "Run a Lighthouse audit against a URL and store the report",
      {
        url: z.string().describe("The URL to audit, including protocol (http:// or https://)"),
        categories: z.array(z.string()).optional().describe("Optional Lighthouse categories to run, e.g. ['performance','accessibility']"),
        formFactor: z.enum(["mobile", "desktop"]).optional().describe("Emulated form factor")
      },
      async ({ url, categories, formFactor }) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        try {
          const opts: any = {};
          if (categories && categories.length > 0) opts.categories = categories;
          if (formFactor === 'mobile') opts.emulateMobile = true;
          const runnerResult = await runLighthouseAudit(url, opts);
          const reportJson = runnerResult.report;
          const lhr = runnerResult.lhr;
          this.reports.set(id, {
            id,
            url,
            fetchedAt: new Date().toISOString(),
            lhr,
            report: JSON.parse(reportJson)
          });
          const perf = lhr.categories?.performance?.score ?? null;
          const accessibility = lhr.categories?.accessibility?.score ?? null;
          const summary = {
            reportId: id,
            url,
            fetchedAt: new Date().toISOString(),
            performance: perf !== null ? Math.round(perf * 100) : undefined,
            accessibility: accessibility !== null ? Math.round(accessibility * 100) : undefined
          };
          // 返回所有信息，便于 HTTP 路由复用
          return {
            content: [
              { type: "text", text: JSON.stringify(summary, null, 2) },
              { type: "text", text: JSON.stringify(lhr, null, 2) },
              { type: "text", text: JSON.stringify(JSON.parse(reportJson), null, 2) }
            ]
          };
        } catch (error) {
          return {
            content: [
              { type: "text", text: `Lighthouse audit failed: ${error}` }
            ]
          };
        }
      }
    );
    this.server.tool(
      "lighthouse_get_report",
      "Retrieve a previously-run Lighthouse report by reportId",
      {
        reportId: z.string().describe("The report id returned by `lighthouse_run_audit`")
      },
      async ({ reportId }) => {
        const record = this.reports.get(reportId);
        if (!record) {
          return {
            content: [
              { type: "text", text: `Report not found: ${reportId}` }
            ]
          };
        }
        return {
          content: [
            { type: "text", text: JSON.stringify(record.report, null, 2) }
          ]
        };
      }
    );
  }

  // 新增：暴露一个直接调用 MCP 工具的接口
  async runAuditViaTool(params: { url: string; categories?: string[]; formFactor?: 'mobile' | 'desktop' }) {
    // @ts-ignore
    return await this.server.invokeTool("lighthouse_run_audit", params);
  }

  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }
}

export default LighthouseMcpServer;

export async function startMcpServer(): Promise<void> {
  // Run HTTP/SSE server
  const port = Number(process.env.PORT || process.env.AUDIT_PORT || 5000);
  const mcp = new LighthouseMcpServer();
  let sseTransport: SSEServerTransport | null = null;

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/sse') {
        // SSE handshake: create transport and connect
        sseTransport = new SSEServerTransport('/messages', res as unknown as ServerResponse<IncomingMessage>);
        await mcp.connect(sseTransport);
        return;
      }

      if (req.method === 'POST' && req.url === '/messages') {
        if (!sseTransport) {
          // @ts-ignore
          res.writeHead(400);
          res.end();
          return;
        }
        await sseTransport.handlePostMessage(req as unknown as IncomingMessage, res as unknown as ServerResponse<IncomingMessage>);
        return;
      }

      if (req.method === 'POST' && req.url === '/audit') {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
        }
        const parsed = JSON.parse(body || '{}');
        const url = parsed.url as string | undefined;
        if (!url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'missing url' }));
          return;
        }
        try {
          const result = await mcp.runAuditViaTool({ url, categories: parsed.categories, formFactor: parsed.formFactor });
          let fix = null;
          if (result && result.lhr) {
            fix = await autoFixFromReport({ lhr: result.lhr, report: JSON.stringify(result.report) });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ summary: result.summary, fix, error: result.error }));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
        return;
      }

      // fallback
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'MCP Optimizer running — POST /audit { "url": "https://..." }' }));
    } catch (outerErr: any) {
      // ensure no plain-text stdout noise
      try {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(outerErr) }));
      } catch (_) {
        // ignore
      }
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => resolve());
    server.on('error', reject);
  });
}
