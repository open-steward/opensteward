/**
 * End to end: the tool list an agent sees follows GET /v1/capabilities, and
 * falls back to every tool — with a warning on stderr — when the deployment
 * cannot say. Spawns the real binary, as the stdio suites do: the list and
 * stderr are the interface.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { resolve } from 'node:path'

let server: http.Server
let baseUrl: string
let capabilities: { status: number; body: unknown }

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '', 'http://stub.local')
    res.setHeader('content-type', 'application/json')
    if (url.pathname === '/v1/customers') {
      res.end(JSON.stringify({ data: [], meta: { totalCount: 0 } }))
      return
    }
    if (url.pathname === '/v1/capabilities') {
      res.statusCode = capabilities.status
      res.end(JSON.stringify(capabilities.body))
      return
    }
    res.statusCode = 404
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND' } }))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((r, rj) => server.close((e) => (e ? rj(e) : r())))
})

beforeEach(() => {
  capabilities = { status: 200, body: { data: { verticals: ['accounting'] } } }
})

/** Written by `main()` once the transport is serving. */
const READY = '[mcp-server] ready'

/** Newline-delimited JSON-RPC over the child's stdio (trimmed from e2e-stdio-tenant). */
function rpc(child: ChildProcessWithoutNullStreams) {
  let buffer = ''
  let nextId = 1
  const pending = new Map<number, (msg: Record<string, unknown>) => void>()
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk
    let i: number
    while ((i = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, i).trim()
      buffer = buffer.slice(i + 1)
      if (!line) continue
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(line) as Record<string, unknown>
      } catch {
        continue
      }
      const id = msg['id']
      if (typeof id === 'number' && pending.has(id)) {
        pending.get(id)!(msg)
        pending.delete(id)
      }
    }
  })
  return {
    request(method: string, params: unknown = {}): Promise<Record<string, unknown>> {
      const id = nextId++
      return new Promise((resolveMsg, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`timeout waiting for ${method}`))
        }, 20_000)
        pending.set(id, (msg) => {
          clearTimeout(timer)
          resolveMsg(msg)
        })
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      })
    },
    notify(method: string): void {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params: {} }) + '\n')
    },
  }
}

async function toolsAndStderr(): Promise<{ names: string[]; stderr: string }> {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', resolve(__dirname, '../src/index.ts')],
    {
      env: { ...process.env, OPENSTEWARD_BASE_URL: baseUrl, OPENSTEWARD_MCP_KEY: 'osk_test' },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  ) as ChildProcessWithoutNullStreams
  const stderr: string[] = []
  child.stderr.setEncoding('utf8')
  // stdout and stderr are separate pipes, so a tools/list answer can arrive
  // before the ready line does. Wait for that line: every warning this suite
  // asserts on is written before it.
  let readyTimer: ReturnType<typeof setTimeout> | undefined
  const ready = new Promise<void>((resolveReady, reject) => {
    readyTimer = setTimeout(() => reject(new Error(`no ready line: ${stderr.join('')}`)), 20_000)
    child.stderr.on('data', (c: string) => {
      stderr.push(c)
      if (stderr.join('').includes(READY)) {
        clearTimeout(readyTimer)
        resolveReady()
      }
    })
  })
  // Only awaited on the success path; a failed handshake must not leave it
  // to reject later, unhandled.
  ready.catch(() => undefined)
  try {
    const client = rpc(child)
    const init = await client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'e2e-capabilities', version: '0.0.0' },
    })
    if (!init['result']) throw new Error(`initialize failed: ${stderr.join('')}`)
    client.notify('notifications/initialized')
    const list = await client.request('tools/list')
    const tools = (list['result'] as { tools: { name: string }[] }).tools
    await ready
    return { names: tools.map((t) => t.name), stderr: stderr.join('') }
  } finally {
    clearTimeout(readyTimer)
    child.kill()
  }
}

describe('e2e: the tool list follows GET /v1/capabilities', () => {
  it('registers only the verticals the deployment reports [L7:G03]', async () => {
    const { names, stderr } = await toolsAndStderr()
    expect(names).toEqual(
      expect.arrayContaining(['list_customers', 'list_invoices', 'get_organization']),
    )
    expect(names).not.toContain('list_charges')
    expect(names).not.toContain('list_deals')
    expect(stderr).not.toContain('registering every tool')
    expect(stderr).toContain(`${names.length} tools (1 enabled vertical)`)
  }, 30_000)

  it('the ready line counts the verticals that got tools, not the names reported', async () => {
    capabilities = {
      status: 200,
      body: { data: { verticals: ['accounting', 'hris', 'accounting', 'crm'] } },
    }
    const { names, stderr } = await toolsAndStderr()
    expect(names).toContain('list_deals')
    expect(names).not.toContain('list_charges')
    expect(stderr).toContain(`${names.length} tools (2 enabled verticals)`)
  }, 30_000)

  it('registers every tool, with a warning, when the deployment fails to answer [L7:G04]', async () => {
    capabilities = { status: 500, body: { error: { code: 'INTERNAL', message: 'boom' } } }
    const { names, stderr } = await toolsAndStderr()
    expect(names).toContain('list_charges')
    expect(names.length).toBeGreaterThan(100)
    expect(stderr).toContain('registering every tool')
    expect(stderr).toContain('INTERNAL')
    expect(stderr).toContain(`${names.length} tools (all verticals)`)
  }, 30_000)

  it('registers every tool, with a warning, on an older deployment (404) [L7:G04]', async () => {
    capabilities = { status: 404, body: { error: { code: 'NOT_FOUND' } } }
    const { names, stderr } = await toolsAndStderr()
    expect(names).toContain('list_charges')
    expect(stderr).toContain('older release')
    expect(stderr).toContain('registering every tool')
  }, 30_000)

  it('registers every tool, with a warning, on a 2xx of another shape [L7:G04]', async () => {
    capabilities = { status: 200, body: { data: [], meta: { totalCount: 0 } } }
    const { names, stderr } = await toolsAndStderr()
    expect(names).toContain('list_charges')
    expect(names.length).toBeGreaterThan(100)
    expect(stderr).toContain('registering every tool')
    // Not only "an older release": a 2xx of another shape is usually a proxy page.
    expect(stderr).toContain('proxy or catch-all page')
  }, 30_000)
})
