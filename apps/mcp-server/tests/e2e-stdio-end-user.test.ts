import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

/**
 * End-to-end stdio probe for end-user mode: spawn the actual binary
 * against a mock /v1/me/* backend and confirm:
 *   - tools/list emits `get_me` + `list_my_connections` (NOT `list_customers`)
 *   - get_me hits /v1/me, not /v1/customers
 *   - no write-method tools appear
 */

let server: http.Server
let baseUrl: string

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '', 'http://stub.local')
    res.setHeader('content-type', 'application/json')

    if (url.pathname === '/v1/me' && req.method === 'GET') {
      res.end(
        JSON.stringify({
          data: {
            id: 'eu_demo',
            tenantId: 't_acme',
            email: 'customer@acme.com',
            displayName: 'Acme Customer',
          },
        }),
      )
      return
    }
    if (url.pathname === '/v1/me/connections' && req.method === 'GET') {
      res.end(
        JSON.stringify({
          data: [
            { id: 'conn-1', vertical: 'accounting', platform: 'fortnox', label: null },
          ],
        }),
      )
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

  constructor(private child: { stdin: NodeJS.WritableStream; stdout: NodeJS.ReadableStream }) {
    child.stdout.setEncoding!('utf8')
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
      try { msg = JSON.parse(line) as JsonRpcMessage } catch { continue }
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
      this.pending.set(id, (msg) => { clearTimeout(timer); resolve(msg) })
      this.child.stdin.write(payload + '\n')
    })
  }

  notify(method: string, params?: unknown): void {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }
}

describe('e2e: stdio end-user mode', () => {
  it('lists end-user tools and calls get_me against /v1/me', async () => {
    const entry = resolve(__dirname, '../src/index.ts')
    // Spawn via `node --import tsx` rather than `pnpm exec tsx`: under the
    // Vitest worker `pnpm` may not be on PATH, which made the spawn fail
    // silently and the handshake hang to the test timeout. Using the current
    // node binary + tsx loader removes that dependency.
    const child = spawn(process.execPath, ['--import', 'tsx', entry], {
      env: {
        ...process.env,
        OPENSTEWARD_BASE_URL: baseUrl,
        OPENSTEWARD_USER_TOKEN: 'eut_demo',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stderr: string[] = []
    child.stderr!.setEncoding('utf8')
    child.stderr!.on('data', (c: string) => stderr.push(c))

    try {
      const client = new StdioClient(child as unknown as { stdin: NodeJS.WritableStream; stdout: NodeJS.ReadableStream })

      const init = await client.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'e2e-test', version: '0.0.0' },
      })
      expect(init.result).toBeDefined()
      client.notify('notifications/initialized')

      const list = await client.request('tools/list')
      const result = list.result as { tools: Array<{ name: string }> }
      const names = new Set(result.tools.map((t) => t.name))

      // End-user surface: get_me + list_my_connections instead of list_customers
      expect(names.has('get_me')).toBe(true)
      expect(names.has('list_my_connections')).toBe(true)
      expect(names.has('list_customers')).toBe(false)
      expect(names.has('get_customer')).toBe(false)
      expect(names.has('list_customer_connections')).toBe(false)

      // Resource tools still present
      expect(names.has('list_invoices')).toBe(true)

      // Read-only structural guarantee
      for (const t of result.tools) {
        expect(t.name).not.toMatch(/^(create|update|delete|patch|put|post)_/)
      }

      // get_me must hit /v1/me; payload appears wrapped in <os_data>.
      const call = await client.request('tools/call', {
        name: 'get_me',
        arguments: {},
      })
      const callResult = call.result as { content: Array<{ type: string; text: string }> }
      expect(callResult.content[0]!.text).toContain('customer@acme.com')
      expect(callResult.content[0]!.text).toContain('<os_data>')

      // list_my_connections must hit /v1/me/connections.
      const conns = await client.request('tools/call', {
        name: 'list_my_connections',
        arguments: {},
      })
      const connsResult = conns.result as { content: Array<{ type: string; text: string }> }
      expect(connsResult.content[0]!.text).toContain('conn-1')
    } finally {
      child.kill('SIGTERM')
      await new Promise<void>((r) => child.once('exit', () => r()))
      if (process.env['DEBUG_MCP_E2E']) {
        process.stderr.write(`stderr:\n${stderr.join('')}\n`)
      }
    }
  }, 30_000)
})
