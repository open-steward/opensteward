import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { resolve } from 'node:path'

/**
 * End-to-end stdio probe: spawn the actual binary against a mock
 * integration-server, complete the MCP handshake, and exercise
 * `tools/list` + `tools/call`.
 */

let server: http.Server
let baseUrl: string

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '', 'http://stub.local')
    res.setHeader('content-type', 'application/json')

    if (url.pathname === '/v1/customers' && req.method === 'GET') {
      res.end(
        JSON.stringify({
          data: [{ id: 'cust-1', email: 'jane@acme.com' }],
          meta: { totalCount: 1 },
        }),
      )
      return
    }
    if (url.pathname === '/v1/customers/cust-1' && req.method === 'GET') {
      res.end(JSON.stringify({ data: { id: 'cust-1', email: 'jane@acme.com' } }))
      return
    }
    res.statusCode = 404
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND' } }))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${addr.port}`
})

afterAll(async () => {
  await new Promise<void>((r, rj) => server.close((e) => (e ? rj(e) : r())))
})

interface JsonRpcMessage {
  jsonrpc: '2.0'
  id?: number | string
  method?: string
  params?: unknown
  result?: unknown
  error?: unknown
}

class StdioClient {
  private buffer = ''
  private nextId = 1
  private pending = new Map<number, (msg: JsonRpcMessage) => void>()

  constructor(private child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.onData(chunk))
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (!line) continue
      let msg: JsonRpcMessage
      try {
        msg = JSON.parse(line) as JsonRpcMessage
      } catch {
        continue
      }
      if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
        const resolver = this.pending.get(msg.id)!
        this.pending.delete(msg.id)
        resolver(msg)
      }
    }
  }

  request(method: string, params?: unknown): Promise<JsonRpcMessage> {
    const id = this.nextId++
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params })
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Timeout waiting for response to ${method}`))
      }, 15000)
      this.pending.set(id, (msg) => {
        clearTimeout(timer)
        resolve(msg)
      })
      this.child.stdin.write(payload + '\n')
    })
  }

  notify(method: string, params?: unknown): void {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }
}

/**
 * Shared helper — spawns the MCP server in tenant mode against `baseUrl`
 * and returns a connected StdioClient after completing the MCP handshake.
 * The caller is responsible for killing the child process.
 */
async function spawnTenantClient(): Promise<{
  client: StdioClient
  child: ReturnType<typeof spawn>
  stderr: string[]
}> {
  const entry = resolve(__dirname, '../src/index.ts')
  const child = spawn(process.execPath, ['--import', 'tsx', entry], {
    env: {
      ...process.env,
      OPENSTEWARD_BASE_URL: baseUrl,
      OPENSTEWARD_MCP_KEY: 'osk_test',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const stderr: string[] = []
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (c: string) => stderr.push(c))

  const client = new StdioClient(child)
  const init = await client.request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'e2e-test', version: '0.0.0' },
  })
  if (!init.result) throw new Error('MCP initialize failed')
  client.notify('notifications/initialized')

  return { client, child, stderr }
}

describe('e2e: stdio tenant mode', () => {
  it('lists tools and calls list_customers against a mock backend', async () => {
    const { client, child, stderr } = await spawnTenantClient()
    try {
      // tools/list should include the schema-driven tools
      const list = await client.request('tools/list')
      const result = list.result as { tools: Array<{ name: string }> }
      expect(result.tools.length).toBeGreaterThan(20)
      const names = new Set(result.tools.map((t) => t.name))
      expect(names.has('list_customers')).toBe(true)
      expect(names.has('list_invoices')).toBe(true)
      expect(names.has('get_organization')).toBe(true)
      // No write tools must ever appear
      for (const t of result.tools) {
        expect(t.name).not.toMatch(/^(create|update|delete|patch|put|post)_/)
      }

      // Call list_customers — server must hit the mock backend
      const call = await client.request('tools/call', {
        name: 'list_customers',
        arguments: { limit: 5 },
      })
      const callResult = call.result as { content: Array<{ type: string; text: string }> }
      expect(callResult.content[0]!.text).toContain('jane@acme.com')
      expect(callResult.content[0]!.text).toContain('<os_data>')
    } finally {
      child.kill('SIGTERM')
      await new Promise<void>((r) => child.once('exit', () => r()))
      if (process.env['DEBUG_MCP_E2E']) {
        process.stderr.write(`stderr:\n${stderr.join('')}\n`)
      }
    }
  }, 30_000)

  it('tools/call to a resource tool without connection_id returns isError', async () => {
    // This covers a gap: no existing test verifies that omitting the required
    // connection_id argument causes the tool to return an MCP error response
    // (isError: true) rather than silently succeeding or crashing the server.
    // The mock server returns 404 for unknown routes, which the rest-client
    // converts to a RestClientError; the stdio handler catches it and wraps
    // it in an isError content block.
    const { client, child, stderr } = await spawnTenantClient()
    try {
      const call = await client.request('tools/call', {
        name: 'list_invoices',
        // Intentionally omit connection_id — the tool's inputSchema declares it required.
        arguments: {},
      })
      const callResult = call.result as {
        isError?: boolean
        content: Array<{ type: string; text: string }>
      }
      // The server must signal failure via isError, not silently succeed.
      expect(callResult.isError).toBe(true)
      // The error text must identify the failing tool so the agent can diagnose.
      expect(callResult.content[0]!.text).toContain('list_invoices')
    } finally {
      child.kill('SIGTERM')
      await new Promise<void>((r) => child.once('exit', () => r()))
      if (process.env['DEBUG_MCP_E2E']) {
        process.stderr.write(`stderr:\n${stderr.join('')}\n`)
      }
    }
  }, 30_000)
})
