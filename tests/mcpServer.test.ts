// =============================================================================
// GitUnderstand (git-understand.com) — MCP HTTP Server Integration Tests
// Agent 85: Vitest suite verifying Built-in Model Context Protocol (MCP) Server:
// - GET /mcp (Discovery metadata, protocol version, capabilities, and 5 tools)
// - POST /mcp with JSON-RPC 2.0 initialize
// - POST /mcp with JSON-RPC 2.0 tools/list (all 5 tools & input schemas)
// - POST /mcp with invalid method & invalid protocol handling
// - POST /mcp batch requests, notifications, and edge cases
// =============================================================================

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../backend/src/server.js';
import {
  MCP_TOOLS_DEFINITIONS,
  getMcpDiscoveryPayload,
  handleMcpRpcRequest,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type McpToolDefinition,
} from '../backend/src/mcp/mcpServer.js';

describe('Model Context Protocol (MCP) JSON-RPC HTTP Server', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Discovery Endpoint: GET /mcp
  // ---------------------------------------------------------------------------
  describe('GET /mcp (Server Discovery & Protocol Metadata)', () => {
    it('returns HTTP 200 with valid JSON content type and CORS headers', async () => {
      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(response.headers.get('access-control-allow-origin')).toBe('*');

      const data = await response.json();
      expect(data).toBeDefined();
      expect(data.name).toBe('git-understand-mcp');
      expect(data.version).toBe('3.0.0');
      expect(data.protocolVersion).toBe('2024-11-05');
      expect(data.status).toBe('online');
      expect(data.capabilities).toEqual({
        tools: { listChanged: false },
      });
      expect(data.endpoints).toEqual({
        http: '/',
        rpc: '/',
      });
    });

    it('advertises all 5 canonical MCP tools in discovery payload', async () => {
      const response = await fetch(`${baseUrl}/mcp`);
      const data = await response.json();

      expect(Array.isArray(data.tools)).toBe(true);
      expect(data.tools.length).toBe(5);

      const toolNames = data.tools.map((t: McpToolDefinition) => t.name);
      expect(toolNames).toContain('understand_repo');
      expect(toolNames).toContain('get_architecture_diagram');
      expect(toolNames).toContain('get_repo_digest');
      expect(toolNames).toContain('run_xray_audit');
      expect(toolNames).toContain('search_codebase');
    });

    it('matches the pure getMcpDiscoveryPayload() export', () => {
      const payload = getMcpDiscoveryPayload();
      expect(payload.name).toBe('git-understand-mcp');
      expect(payload.version).toBe('3.0.0');
      expect(payload.protocolVersion).toBe('2024-11-05');
      expect(Array.isArray(payload.tools)).toBe(true);
      expect((payload.tools as McpToolDefinition[]).length).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. JSON-RPC 2.0 Initialization: POST /mcp (initialize)
  // ---------------------------------------------------------------------------
  describe('POST /mcp (initialize)', () => {
    it('successfully handles initialize request with numeric ID', async () => {
      const reqPayload: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'visual-studio-agent',
            version: '1.0.0',
          },
        },
      };

      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqPayload),
      });

      expect(res.status).toBe(200);
      const json: JsonRpcResponse = await res.json();

      expect(json.jsonrpc).toBe('2.0');
      expect(json.id).toBe(1);
      expect(json.error).toBeUndefined();
      expect(json.result).toBeDefined();

      expect(json.result.protocolVersion).toBe('2024-11-05');
      expect(json.result.serverInfo).toEqual({
        name: 'git-understand-mcp',
        version: '3.0.0',
      });
      expect(json.result.capabilities).toEqual({
        tools: { listChanged: false },
      });
      expect(typeof json.result.instructions).toBe('string');
      expect(json.result.instructions).toContain('GitUnderstand MCP Server');
    });

    it('preserves string request ID on initialize', async () => {
      const reqPayload: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 'client-init-uuid-999',
        method: 'initialize',
        params: {},
      };

      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqPayload),
      });

      const json: JsonRpcResponse = await res.json();
      expect(json.id).toBe('client-init-uuid-999');
      expect(json.result?.serverInfo?.name).toBe('git-understand-mcp');
    });

    it('handles initialized notification with 204 No Content when id is omitted', async () => {
      const notification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      };

      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notification),
      });

      expect(res.status).toBe(204);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. JSON-RPC 2.0 Tools Listing: POST /mcp (tools/list)
  // ---------------------------------------------------------------------------
  describe('POST /mcp (tools/list — All 5 Canonical Tools)', () => {
    it('returns exactly 5 tools conforming to Model Context Protocol schema', async () => {
      const reqPayload: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 42,
        method: 'tools/list',
      };

      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqPayload),
      });

      expect(res.status).toBe(200);
      const json: JsonRpcResponse = await res.json();

      expect(json.jsonrpc).toBe('2.0');
      expect(json.id).toBe(42);
      expect(json.result?.tools).toBeDefined();

      const tools: McpToolDefinition[] = json.result.tools;
      expect(tools.length).toBe(5);

      const names = tools.map((t) => t.name);
      expect(names).toEqual([
        'understand_repo',
        'get_architecture_diagram',
        'get_repo_digest',
        'run_xray_audit',
        'search_codebase',
      ]);
    });

    it('verifies inputSchema and required properties for Tool 1: understand_repo', () => {
      const tool = MCP_TOOLS_DEFINITIONS.find((t) => t.name === 'understand_repo');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('visual architecture blueprint summary');
      expect(tool?.inputSchema.type).toBe('object');
      expect(tool?.inputSchema.required).toEqual(['repoUrl']);
      expect(tool?.inputSchema.properties).toHaveProperty('repoUrl');
      expect(tool?.inputSchema.properties).toHaveProperty('byokApiKey');
      expect(tool?.inputSchema.properties).toHaveProperty('forceRefresh');
    });

    it('verifies inputSchema and required properties for Tool 2: get_architecture_diagram', () => {
      const tool = MCP_TOOLS_DEFINITIONS.find((t) => t.name === 'get_architecture_diagram');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Mermaid diagrams');
      expect(tool?.inputSchema.type).toBe('object');
      expect(tool?.inputSchema.required).toEqual(['repoUrl']);
      expect(tool?.inputSchema.properties).toHaveProperty('repoUrl');
      expect(tool?.inputSchema.properties).toHaveProperty('kind');
      const kindProp = tool?.inputSchema.properties.kind as { enum?: string[] };
      expect(kindProp?.enum).toEqual(['all', 'architecture', 'sequence', 'class', 'er']);
    });

    it('verifies inputSchema and required properties for Tool 3: get_repo_digest', () => {
      const tool = MCP_TOOLS_DEFINITIONS.find((t) => t.name === 'get_repo_digest');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Gitingest-compatible token-budgeted code digest');
      expect(tool?.inputSchema.type).toBe('object');
      expect(tool?.inputSchema.required).toEqual(['repoUrl']);
      expect(tool?.inputSchema.properties).toHaveProperty('repoUrl');
      expect(tool?.inputSchema.properties).toHaveProperty('format');
      expect(tool?.inputSchema.properties).toHaveProperty('maxTotalTokens');
      expect(tool?.inputSchema.properties).toHaveProperty('includeTests');
      expect(tool?.inputSchema.properties).toHaveProperty('includeDocs');
      expect(tool?.inputSchema.properties).toHaveProperty('selectedSubsystems');
      const formatProp = tool?.inputSchema.properties.format as { enum?: string[] };
      expect(formatProp?.enum).toEqual(['digest', 'brief', 'tree']);
    });

    it('verifies inputSchema and required properties for Tool 4: run_xray_audit', () => {
      const tool = MCP_TOOLS_DEFINITIONS.find((t) => t.name === 'run_xray_audit');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Decision-1 9-pillar');
      expect(tool?.inputSchema.type).toBe('object');
      expect(tool?.inputSchema.required).toEqual(['repoUrl']);
      expect(tool?.inputSchema.properties).toHaveProperty('repoUrl');
      expect(tool?.inputSchema.properties).toHaveProperty('maxModules');
      expect(tool?.inputSchema.properties).toHaveProperty('byokApiKey');
    });

    it('verifies inputSchema and required properties for Tool 5: search_codebase', () => {
      const tool = MCP_TOOLS_DEFINITIONS.find((t) => t.name === 'search_codebase');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('semantic and multimodal vector search');
      expect(tool?.inputSchema.type).toBe('object');
      expect(tool?.inputSchema.required).toEqual(['repoUrl']);
      expect(tool?.inputSchema.properties).toHaveProperty('repoUrl');
      expect(tool?.inputSchema.properties).toHaveProperty('query');
      expect(tool?.inputSchema.properties).toHaveProperty('imageBase64');
      expect(tool?.inputSchema.properties).toHaveProperty('topK');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Invalid Method & Protocol Error Handling: POST /mcp
  // ---------------------------------------------------------------------------
  describe('POST /mcp (Invalid Method & Protocol Error Handling)', () => {
    it('returns JSON-RPC error code -32601 for nonexistent method', async () => {
      const reqPayload = {
        jsonrpc: '2.0',
        id: 'err-1',
        method: 'nonexistent/unsupported_method',
        params: {},
      };

      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqPayload),
      });

      expect(res.status).toBe(200);
      const json: JsonRpcResponse = await res.json();

      expect(json.jsonrpc).toBe('2.0');
      expect(json.id).toBe('err-1');
      expect(json.result).toBeUndefined();
      expect(json.error).toBeDefined();
      expect(json.error?.code).toBe(-32601);
      expect(json.error?.message).toContain('Method not found: "nonexistent/unsupported_method"');
    });

    it('returns error code -32600 for invalid jsonrpc version', async () => {
      const reqPayload = {
        jsonrpc: '1.0',
        id: 'err-2',
        method: 'initialize',
      };

      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqPayload),
      });

      const json: JsonRpcResponse = await res.json();
      expect(json.error?.code).toBe(-32600);
      expect(json.error?.message).toContain('jsonrpc version must be "2.0"');
    });

    it('returns error code -32600 when request body is not an object', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify('raw string body'),
      });

      const json: JsonRpcResponse = await res.json();
      expect(json.error?.code).toBe(-32600);
      expect(json.error?.message).toContain('Body must be a JSON-RPC 2.0 object');
    });

    it('returns HTTP 400 with -32600 error when batch array is empty', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([]),
      });

      expect(res.status).toBe(400);
      const json: JsonRpcResponse = await res.json();
      expect(json.error?.code).toBe(-32600);
      expect(json.error?.message).toContain('Batch array cannot be empty');
    });

    it('returns error code -32601 when calling tools/call with unknown tool name', async () => {
      const reqPayload = {
        jsonrpc: '2.0',
        id: 'tool-err',
        method: 'tools/call',
        params: {
          name: 'mythical_fake_tool',
          arguments: {},
        },
      };

      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqPayload),
      });

      const json: JsonRpcResponse = await res.json();
      expect(json.error?.code).toBe(-32601);
      expect(json.error?.message).toContain('Tool not found: "mythical_fake_tool"');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Additional Protocol Capabilities (Ping & Batching)
  // ---------------------------------------------------------------------------
  describe('POST /mcp (Ping & Batch Requests)', () => {
    it('responds to ping with empty result object', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'ping-1',
          method: 'ping',
        }),
      });

      const json: JsonRpcResponse = await res.json();
      expect(json.id).toBe('ping-1');
      expect(json.result).toEqual({});
    });

    it('processes batch JSON-RPC requests correctly', async () => {
      const batch = [
        { jsonrpc: '2.0', id: 101, method: 'ping' },
        { jsonrpc: '2.0', id: 102, method: 'tools/list' },
      ];

      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });

      expect(res.status).toBe(200);
      const list: JsonRpcResponse[] = await res.json();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(2);

      expect(list[0].id).toBe(101);
      expect(list[0].result).toEqual({});

      expect(list[1].id).toBe(102);
      expect(list[1].result?.tools?.length).toBe(5);
    });

    it('direct handleMcpRpcRequest handles null body safely', async () => {
      const res = await handleMcpRpcRequest(null);
      expect(res?.error?.code).toBe(-32600);
    });
  });
});
