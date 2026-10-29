// Vercel serverless entry: stateless Streamable HTTP MCP endpoint.
// Reachable as /mcp/<MCP_TOKEN> (see vercel.json). Without MCP_TOKEN the endpoint stays closed.
import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from '../hosted/server-factory.js';

function tokenOk(given) {
  const expected = process.env.MCP_TOKEN;
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (!process.env.MCP_TOKEN) return send(res, 503, { error: 'MCP_TOKEN is not configured' });
  const given = req.query?.token ?? new URL(req.url, 'http://x').searchParams.get('token');
  if (!tokenOk(given)) return send(res, 401, { error: 'unauthorized' });
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return send(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed (stateless server, use POST)' }, id: null });
  }

  const server = createServer({ hosted: true });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) send(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
  }
}
