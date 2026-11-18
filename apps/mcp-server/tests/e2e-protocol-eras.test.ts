/**
 * Pins two properties nothing else covers — asserted on the wire, not the
 * schema.
 *
 * 1. BOTH PROTOCOL ERAS ARE SERVED. v2's `serveStdio` runs with
 *    `legacy: 'serve'`, so a 2025-era client opening with `initialize` is
 *    pinned to a 2025-era instance while a modern client opens with no
 *    handshake at all — protocol version and client identity travel per
 *    request in `_meta` (`io.modelcontextprotocol/protocol` /
 *    `io.modelcontextprotocol/client`). If someone flips that option to
 *    `'reject'`, or the SDK drops legacy support, every shipped agent that has
 *    not upgraded breaks — and the existing e2e tests would still pass,
 *    because they only exercise the legacy path.
 *
 * 2. UNKNOWN QUERY PARAMS ARE REFUSED, NOT FORWARDED. `list_*` tools are built
 *    with `z.strictObject`. The loose form used to be here on the belief that
 *    unrecognised keys reached the REST API as filters; they did not — the
 *    server reads a fixed four-key allowlist — so all it did was let a typo
 *    parse as a working filter. See the second describe block below.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { resolve } from 'node:path'

/** Query strings the mock REST server saw, in order. */
let seenQueries: string[] = []
let server: http.Server
let baseUrl: string

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '', 'http://stub.local')
    seenQueries.push(url.search)
    res.setHeader('content-type', 'application/json')
    if (url.pathname === '/v1/customers') {
      res.end(JSON.stringify({ data: [{ id: 'cust-1' }], meta: { totalCount: 1 } }))
      return
    }
    // Every resource list route returns an empty page; we only care that the
    // request arrived and what its query string was.
    res.end(JSON.stringify({ data: [], meta: { totalCount: 0 } }))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((r, rj) => server.close((e) => (e ? rj(e) : r())))
})

/** Minimal newline-delimited JSON-RPC client over a spawned server process. */
class StdioClient {
  private buf = ''
  private pending = new Map<number, (m: Record<string, unknown>) => void>()
  private nextId = 0
  constructor(private child: ChildProcessWithoutNullStreams) {
    child.stdout.on('data', (d: Buffer) => {
      this.buf += d.toString()
      let i: number
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i)
        this.buf = this.buf.slice(i + 1)
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line) as Record<string, unknown>
          const id = msg['id'] as number | undefined
          if (id !== undefined && this.pending.has(id)) {
            this.pending.get(id)!(msg)
            this.pending.delete(id)
          }
        } catch {
          /* non-JSON line (log noise) — ignore */
        }
      }
    })
  }
  request(method: string, params: unknown): Promise<Record<string, unknown>> {
    const id = ++this.nextId
    return new Promise((res, rej) => {
      this.pending.set(id, res)
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      setTimeout(() => rej(new Error(`timeout waiting for ${method}`)), 15_000)
    })
  }
  notify(method: string, params: unknown): void {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }
}

function spawnServer(): { child: ChildProcessWithoutNullStreams; client: StdioClient } {
  const entry = resolve(import.meta.dirname, '../src/index.ts')
  const child = spawn(process.execPath, ['--import', 'tsx', entry], {
    env: {
      ...process.env,
      OPENSTEWARD_BASE_URL: baseUrl,
      OPENSTEWARD_MCP_KEY: 'osk_test_key',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams
  return { child, client: new StdioClient(child) }
}

describe('MCP protocol eras over stdio', () => {
  it('serves a modern claim-based opening with no initialize handshake', async () => {
    const { child, client } = spawnServer()
    try {
      // 2026-07-28 shape: no handshake, claims ride on the request itself.
      const res = await client.request('tools/list', {
        _meta: {
          'io.modelcontextprotocol/protocol': { version: '2026-07-28' },
          'io.modelcontextprotocol/client': { name: 'era-test', version: '1.0.0' },
        },
      })
      expect(res['error'], JSON.stringify(res['error'])).toBeUndefined()
      const tools = (res['result'] as { tools: { name: string }[] }).tools
      expect(tools.length).toBeGreaterThan(100)
      expect(tools.map((t) => t.name)).toContain('list_customers')
    } finally {
      child.kill()
    }
  })

  it('still serves a 2025-era initialize opening (legacy agents keep working)', async () => {
    const { child, client } = spawnServer()
    try {
      const init = await client.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'legacy-test', version: '1.0.0' },
      })
      const result = init['result'] as { protocolVersion: string }
      // The server must answer in the era the client opened with, not force
      // the modern revision on it.
      expect(result.protocolVersion).toBe('2024-11-05')
      client.notify('notifications/initialized', {})
      const list = await client.request('tools/list', {})
      expect((list['result'] as { tools: unknown[] }).tools.length).toBeGreaterThan(100)
    } finally {
      child.kill()
    }
  })
})

/**
 * This block used to assert the opposite: that an unrecognised argument was
 * forwarded verbatim as a REST filter, on the belief that `z.looseObject` was
 * enabling filtering the strict form would break.
 *
 * The belief was wrong. `parseQueryParams` on the integration-server reads a
 * fixed four-key allowlist (`page`, `limit`, `updated_after`, `search`) and
 * discards everything else, and the OpenAPI document describes the same four.
 * So nothing was ever filtered by a passed-through key — the parameter rode
 * the query string and the server ignored it. What the loose schema actually
 * bought was that `statuss=PAID` or `limitt=5` parsed cleanly and read to the
 * agent as a working filter, returning a plausible unfiltered answer with
 * nothing to notice. That is Finding 11.
 *
 * A rejected call is recoverable. A silently unfiltered one is not.
 */
describe('list tools refuse params the REST API cannot act on', () => {
  it('rejects an argument absent from the schema instead of forwarding it', async () => {
    const { child, client } = spawnServer()
    seenQueries = []
    try {
      await client.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'passthrough-test', version: '1.0.0' },
      })
      client.notify('notifications/initialized', {})

      const res = await client.request('tools/call', {
        name: 'list_invoices',
        arguments: {
          connection_id: 'conn-1',
          limit: 5,
          vendor_ref: 'ACME-42',
        },
      })

      // Either a protocol-level error or an isError tool result is acceptable;
      // what must NOT happen is a success carrying a filter the server drops.
      const result = res['result'] as { isError?: boolean } | undefined
      expect(res['error'] !== undefined || result?.isError === true).toBe(true)
      expect(seenQueries.find((q) => q.includes('vendor_ref'))).toBeUndefined()
    } finally {
      child.kill()
    }
  })

  it('still forwards every parameter it does advertise', async () => {
    const { child, client } = spawnServer()
    seenQueries = []
    try {
      await client.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'passthrough-test', version: '1.0.0' },
      })
      client.notify('notifications/initialized', {})

      const res = await client.request('tools/call', {
        name: 'list_invoices',
        arguments: {
          connection_id: 'conn-1',
          limit: 5,
          search: 'acme',
          updated_after: '2026-01-01T00:00:00Z',
        },
      })
      expect(res['error'], JSON.stringify(res['error'])).toBeUndefined()

      const q = seenQueries.find((x) => x.includes('limit=5'))
      expect(q, `queries seen: ${JSON.stringify(seenQueries)}`).toBeDefined()
      expect(q).toContain('search=acme')
      expect(q).toContain('updated_after=')
    } finally {
      child.kill()
    }
  })

  it('translates the deprecated `since` alias onto `updated_after`', async () => {
    const { child, client } = spawnServer()
    seenQueries = []
    try {
      await client.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'passthrough-test', version: '1.0.0' },
      })
      client.notify('notifications/initialized', {})

      await client.request('tools/call', {
        name: 'list_invoices',
        arguments: { connection_id: 'conn-1', since: '2026-01-01T00:00:00Z' },
      })

      const q = seenQueries.find((x) => x.includes('updated_after'))
      expect(q, `queries seen: ${JSON.stringify(seenQueries)}`).toBeDefined()
      expect(q).not.toContain('since=')
    } finally {
      child.kill()
    }
  })
})
