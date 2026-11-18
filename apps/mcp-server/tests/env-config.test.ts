/**
 * How the server reads its credential, and what it says when that goes wrong.
 *
 * Both halves matter here. The tenant key was called `OPENSTEWARD_API_KEY`,
 * which is the name that invited the mistake this guard exists for: the value
 * it wants is not any API key, it is one carrying the `mcp:read` scope. Without
 * that scope none of the deployment's MCP protections engage — the read-only
 * guard, the `features.mcp_enabled` kill switch, the MCP rate-limit budget —
 * and the agent runs in a mode an operator can neither see nor stop.
 *
 * The refusal is the deployment's, not this package's. RestClient puts the
 * server's whole error object into the thrown message and `index.ts` dies with
 * it, so the wording an operator reads is the server's. The last test is the
 * one that proves that path end to end; everything else here is the rename.
 *
 * Spawned rather than unit-tested against `readEnv`, because the exit code and
 * stderr *are* the interface — an agent runner shows the operator nothing else.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

let server: http.Server
let baseUrl: string
/** Flipped per test to make the probe succeed or be refused. */
let probeRefusal: { code: string; message: string } | null = null

beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (probeRefusal) {
      res.statusCode = 403
      res.end(JSON.stringify({ error: probeRefusal }))
      return
    }
    // A current deployment answers this; without it the fallback warning (correct
    // behaviour) would trip the "no warning for an osk_ key" assertion below.
    if ((req.url ?? '').startsWith('/v1/capabilities')) {
      res.end(JSON.stringify({ data: { verticals: ['accounting', 'crm'] } }))
      return
    }
    res.end(JSON.stringify({ data: [], meta: { totalCount: 0 } }))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((r, rj) => server.close((e) => (e ? rj(e) : r())))
})

interface Run {
  code: number | null
  stderr: string
}

/** Written by `main()` once the transport is serving. */
const READY = '[mcp-server] ready'

/**
 * Boot the real binary with `env` and report how it went.
 *
 * Resolves on the first DEFINITIVE signal — the process exits, or it prints
 * its ready line — never on a stopwatch.
 *
 * A fixed settling window would race in both directions: a machine slow
 * enough to delay a doomed start past the window reports `code: null` and a
 * test expecting exit 1 fails, and a start that dies just after the window
 * reports success. `MAX_MS` is a backstop for a genuine hang, not a
 * measurement: normal boots resolve in a few hundred ms, and it sits under
 * the 10s `testTimeout` so a breach reports as this helper's failure rather
 * than a bare vitest timeout.
 */
const MAX_MS = 8000

function boot(env: Record<string, string>): Promise<Run> {
  const entry = resolve(__dirname, '../src/index.ts')
  const child = spawn(process.execPath, ['--import', 'tsx', entry], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.setEncoding('utf8')

  return new Promise<Run>((resolvePromise, rejectPromise) => {
    let settled = false
    const finish = (code: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({ code, stderr })
    }

    child.stderr.on('data', (c: string) => {
      stderr += c
      // Serving, and will serve forever — take it down and report it as the
      // "still running" case the callers assert with `code: null`.
      if (!settled && stderr.includes(READY)) {
        child.kill('SIGKILL')
        finish(null)
      }
    })
    child.on('exit', (code) => finish(code))

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      rejectPromise(
        new Error(
          `mcp-server neither exited nor printed "${READY}" within ${MAX_MS}ms. stderr:\n${stderr}`,
        ),
      )
    }, MAX_MS)
  })
}

describe('reading the tenant credential', () => {
  beforeAll(() => {
    probeRefusal = null
  })

  it('accepts OPENSTEWARD_MCP_KEY', async () => {
    const run = await boot({ OPENSTEWARD_BASE_URL: baseUrl, OPENSTEWARD_MCP_KEY: 'osk_test' })
    expect(run.code).toBeNull()
    expect(run.stderr).not.toContain('deprecated')
    // OPENSTEWARD_MCP_KEY must produce no prefix warning for `osk_` values.
    expect(run.stderr).not.toContain('warning')
  })

  it('still accepts OPENSTEWARD_API_KEY, and says it is deprecated', async () => {
    // The alias keeps working; it is simply not the documented name.
    const run = await boot({ OPENSTEWARD_BASE_URL: baseUrl, OPENSTEWARD_API_KEY: 'osk_test' })
    expect(run.code).toBeNull()
    expect(run.stderr).toContain('OPENSTEWARD_API_KEY is deprecated')
    expect(run.stderr).toContain('OPENSTEWARD_MCP_KEY')
    // Says what the value has to be, not just what to call it.
    expect(run.stderr).toContain('mcp:read')
  })

  it('refuses two different values for the same credential', async () => {
    const run = await boot({
      OPENSTEWARD_BASE_URL: baseUrl,
      OPENSTEWARD_MCP_KEY: 'osk_new',
      OPENSTEWARD_API_KEY: 'osk_old',
    })
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('both set to different values')
  })

  it('tolerates both names holding the same value', async () => {
    // A config mid-migration, where someone added the new name without
    // deleting the old. Nothing is ambiguous, so nothing should break.
    const run = await boot({
      OPENSTEWARD_BASE_URL: baseUrl,
      OPENSTEWARD_MCP_KEY: 'osk_same',
      OPENSTEWARD_API_KEY: 'osk_same',
    })
    expect(run.code).toBeNull()
  })

  it('names the new variable when nothing is configured', async () => {
    const run = await boot({ OPENSTEWARD_BASE_URL: baseUrl })
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('OPENSTEWARD_MCP_KEY')
    expect(run.stderr).toContain('mcp:read')
  })

  it('refuses a tenant key and a user token together', async () => {
    const run = await boot({
      OPENSTEWARD_BASE_URL: baseUrl,
      OPENSTEWARD_MCP_KEY: 'osk_test',
      OPENSTEWARD_USER_TOKEN: 'eut_test',
    })
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('not both')
  })
})

describe('a key without mcp:read is refused by the deployment, not by us', () => {
  it("exits at boot, carrying the server's own remedy to stderr", async () => {
    // The whole design in one test. The deployment returns 403
    // MCP_KEY_REQUIRED; RestClient serialises that error object into the
    // thrown message; index.ts dies with it. So this package never has to
    // know why a key was rejected, and the operator reads the deployment's
    // wording rather than a guess made locally.
    probeRefusal = {
      code: 'MCP_KEY_REQUIRED',
      message:
        "This key lacks the mcp:read scope. Mint a key at /api-keys with 'MCP " +
        "agent (read-only)' ticked, or add mcp:read to this one.",
    }
    try {
      const run = await boot({ OPENSTEWARD_BASE_URL: baseUrl, OPENSTEWARD_MCP_KEY: 'osk_plain' })
      expect(run.code).toBe(1)
      expect(run.stderr).toContain('MCP_KEY_REQUIRED')
      expect(run.stderr).toContain('mcp:read')
      expect(run.stderr).toContain('/api-keys')
      // Before the agent connects, not once a tool call fails.
      expect(run.stderr).toContain('Token probe failed')
    } finally {
      probeRefusal = null
    }
  })
})
