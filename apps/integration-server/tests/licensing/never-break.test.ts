/**
 * HARD RULE (handover §2): licensing never breaks a customer's production.
 * There is no crash, no deletion and no blocked config or export, and the token
 * never reaches a log.
 *
 * Each case boots the way a customer meets it:
 * - data already on disk: three connections, two of them above the community
 *   cap of one, each with cached contacts;
 * - then a license in that state.
 *
 * This file also holds the never-break cases of the dropped A3.2:
 * - whitespace-wrapped tokens;
 * - a missing license directory;
 * - a bogus license_state table;
 * - config writable over the cap;
 * - the token never in stdout or stderr.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { chmodSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VERTICALS } from '@opensteward/license-token'
import { CredentialStore, ResourceStore, openDb } from '@opensteward/shared'
import type { LicenseConfig } from '@opensteward/shared/licensing'
import { loadLicenseConfig } from '../../src/config'
import { DATA_SCOPE_HEADER } from '../../src/data-access/scope'
import {
  TEST_STORE_SECRET,
  buildTestServer,
  type BootPaths,
  type TestServer,
  type TestServerOptions,
} from '../integration/helpers'
import { daysFromNow, signDevLicense, tamperPayload } from './dev-license'

const ADMIN = 'never-break-admin-secret-0123456789'
const admin = { 'x-admin-secret': ADMIN }
const SCOPE = { [DATA_SCOPE_HEADER]: JSON.stringify({ tenants: '*' }) }
const OLD = { iat: daysFromNow(-400), nbf: daysFromNow(-400) }
const IS_ROOT = process.getuid?.() === 0

const VALID = signDevLicense()
const EXPIRING = signDevLicense({ exp: daysFromNow(10) })
const GRACE = signDevLicense({ ...OLD, exp: daysFromNow(-10) })
const DEGRADED = signDevLicense({ ...OLD, exp: daysFromNow(-40) })
const TAMPERED = tamperPayload(signDevLicense())
const NOT_YET = signDevLicense({ nbf: daysFromNow(2) })
/** Licensed, but not for crm (the seeded data) or accounting (the OAuth start below). */
const NARROW = signDevLicense({ features: ['mcp', 'vertical:projects'] })

/** What loadLicenseConfig makes of these two values, as compose forwards them. */
function configFromEnv(
  storePath: string,
  values: { OPENSTEWARD_LICENSE: string; OPENSTEWARD_LICENSE_FILE: string },
): LicenseConfig {
  const keys = ['OPENSTEWARD_LICENSE', 'OPENSTEWARD_LICENSE_FILE'] as const
  const saved = keys.map((k) => process.env[k])
  for (const k of keys) process.env[k] = values[k]
  try {
    return loadLicenseConfig(storePath)
  } finally {
    keys.forEach((k, i) => {
      if (saved[i] === undefined) delete process.env[k]
      else process.env[k] = saved[i]
    })
  }
}

/** What `${OPENSTEWARD_LICENSE:-}` / `${OPENSTEWARD_LICENSE_FILE:-}` hand over when the operator set neither. */
function emptyComposeEnv(storePath: string): LicenseConfig {
  return configFromEnv(storePath, { OPENSTEWARD_LICENSE: '', OPENSTEWARD_LICENSE_FILE: '' })
}

/** Three connections and their cached contacts, written with no license guard, as an older install left them. */
async function seedInstall(p: BootPaths): Promise<string[]> {
  const cred = await openDb({ sqlitePath: p.storePath })
  const data = await openDb({ sqlitePath: p.dataStorePath })
  try {
    const creds = await CredentialStore.create(cred, TEST_STORE_SECRET)
    const resources = await ResourceStore.create(data)
    const ids: string[] = []
    for (const label of ['first', 'second', 'third']) {
      const id = await creds.create('hubspot', null, { accessToken: 'x' }, label, 'crm', 'default')
      const contacts: Array<{ id: string; first_name: string }> = [
        { id: `${label}-1`, first_name: 'Ada' },
        { id: `${label}-2`, first_name: 'Grace' },
      ]
      await resources.upsertMany('crm', 'hubspot', id, 'contacts', contacts)
      ids.push(id)
    }
    return ids
  } finally {
    await cred.close()
    await data.close()
  }
}

async function createBogusLicenseState(p: BootPaths): Promise<void> {
  const h = await openDb({ sqlitePath: p.storePath })
  try {
    await h.execScript('CREATE TABLE license_state (junk TEXT)')
  } finally {
    await h.close()
  }
}

type State = 'VALID' | 'EXPIRING' | 'GRACE' | 'DEGRADED' | 'INVALID' | 'MISSING'
interface Case {
  name: string
  state: State
  reason?: string
  community: boolean
  /** /v1/capabilities, exactly. Default: all nine verticals. */
  verticals?: readonly string[]
  /** The unauthenticated OAuth start is refused. Default: in community mode. */
  connectRefused?: boolean
  /** Part of the startup license line: proves the output really was captured. */
  logLine: string
  /** Another line this case must log. */
  alsoLogs?: string
  /** The token this case boots with: it must never reach stdout or stderr. */
  token?: string
  options: (dir: string) => TestServerOptions
  beforeBoot?: (p: BootPaths) => void | Promise<void>
}

const CASES: Case[] = [
  {
    name: 'VALID',
    state: 'VALID',
    community: false,
    logLine: 'license VALID',
    token: VALID,
    options: () => ({ license: VALID }),
  },
  {
    name: 'EXPIRING',
    state: 'EXPIRING',
    community: false,
    logLine: 'license EXPIRING',
    token: EXPIRING,
    options: () => ({ license: EXPIRING }),
  },
  {
    name: 'GRACE',
    state: 'GRACE',
    community: false,
    logLine: 'license EXPIRED on',
    token: GRACE,
    options: () => ({ license: GRACE }),
  },
  {
    name: 'DEGRADED',
    state: 'DEGRADED',
    reason: 'EXPIRED',
    community: true,
    logLine: 'grace period has ended',
    token: DEGRADED,
    options: () => ({ license: DEGRADED }),
  },
  {
    name: 'INVALID (tampered)',
    state: 'INVALID',
    reason: 'BAD_SIGNATURE',
    community: true,
    logLine: 'license INVALID (BAD_SIGNATURE)',
    token: TAMPERED,
    options: () => ({ license: TAMPERED }),
  },
  {
    name: 'NOT_YET_VALID',
    state: 'INVALID',
    reason: 'NOT_YET_VALID',
    community: true,
    logLine: 'license INVALID (NOT_YET_VALID)',
    token: NOT_YET,
    options: () => ({ license: NOT_YET }),
  },
  {
    name: 'MISSING',
    state: 'MISSING',
    community: true,
    logLine: 'no license found',
    options: () => ({ license: null }),
  },
  {
    name: 'VALID: an env token wrapped in whitespace',
    state: 'VALID',
    community: false,
    logLine: 'license VALID',
    token: VALID,
    options: () => ({ license: `  ${VALID}\n` }),
  },
  {
    name: 'VALID: a license file ending in \\r\\n',
    state: 'VALID',
    community: false,
    logLine: 'license VALID',
    token: VALID,
    options: () => ({ license: `${VALID}\r\n`, licenseVia: 'file' }),
  },
  {
    name: 'MISSING: the license directory does not exist',
    state: 'MISSING',
    community: true,
    logLine: 'no license found',
    options: (dir) => ({ license: null, licenseFile: join(dir, 'no-such-dir', 'license.key') }),
  },
  {
    name: 'INVALID: a garbage license file',
    state: 'INVALID',
    community: true,
    logLine: 'license INVALID (',
    options: () => ({ license: 'not a license\n', licenseVia: 'file' }),
  },
  {
    name: 'VALID despite a bogus license_state table',
    state: 'VALID',
    community: false,
    logLine: 'license VALID',
    alsoLogs: 'clock state unavailable',
    token: VALID,
    options: () => ({ license: VALID }),
    beforeBoot: createBogusLicenseState,
  },
  {
    name: 'MISSING: compose forwarded empty values',
    state: 'MISSING',
    community: true,
    logLine: 'no license found',
    options: (dir) => ({ licenseConfig: emptyComposeEnv(join(dir, 'store.db')) }),
  },
  {
    // P8: the data of a vertical the license leaves out stays exportable and configurable.
    name: 'VALID without the vertical the existing data is in',
    state: 'VALID',
    community: false,
    verticals: ['projects'],
    connectRefused: true,
    logLine: 'license VALID',
    token: NARROW,
    options: () => ({ license: NARROW }),
  },
  {
    // A token pasted into the path variable: the path is the token, so it is never echoed.
    name: 'INVALID: OPENSTEWARD_LICENSE_FILE holds the token instead of a path',
    state: 'INVALID',
    reason: 'FILE_UNREADABLE',
    community: true,
    logLine: 'OPENSTEWARD_LICENSE_FILE holds a license token, not a path',
    token: VALID,
    options: (dir) => ({
      licenseConfig: configFromEnv(join(dir, 'store.db'), {
        OPENSTEWARD_LICENSE: '',
        OPENSTEWARD_LICENSE_FILE: VALID,
      }),
    }),
  },
  {
    // The token as a directory, with a file name after it: any segment counts, as in doctor (review r8).
    name: 'INVALID: OPENSTEWARD_LICENSE_FILE holds the token followed by a file name',
    state: 'INVALID',
    reason: 'FILE_UNREADABLE',
    community: true,
    logLine: 'OPENSTEWARD_LICENSE_FILE holds a license token, not a path',
    token: VALID,
    options: (dir) => ({
      licenseConfig: configFromEnv(join(dir, 'store.db'), {
        OPENSTEWARD_LICENSE: '',
        OPENSTEWARD_LICENSE_FILE: `${VALID}/license.key`,
      }),
    }),
  },
  ...(IS_ROOT
    ? []
    : [
        {
          name: 'INVALID: the license file is unreadable by this uid (Review Focus #1)',
          state: 'INVALID',
          reason: 'FILE_UNREADABLE',
          community: true,
          logLine: 'must be readable by uid 1000',
          token: VALID,
          options: () => ({ license: VALID, licenseVia: 'file' }),
          beforeBoot: (p: BootPaths) => chmodSync(p.licenseFile, 0o000),
        } satisfies Case,
      ]),
]

describe.each<Case>(CASES)('never break production: $name', (c) => {
  let server: TestServer
  let ids: string[] = []
  let enableStatus = 0
  const out: string[] = []
  const spies: Array<{ mockRestore(): void }> = []
  const get = (url: string, headers: Record<string, string> = {}) =>
    server.fastify.inject({ method: 'GET', url, headers })
  const overCapId = async (): Promise<string> => {
    const [oldest] = await server.store.listIdsInCreationOrder(1)
    return ids.find((id) => id !== oldest)!
  }

  beforeAll(async () => {
    process.env['ADMIN_SECRET'] = ADMIN
    // pino writes through process.stdout once its write() is replaced
    // (pino lib/tools.js: hasBeenTampered), so this captures every log line.
    const capture = ((chunk: string | Uint8Array) => {
      out.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
      return true
    }) as unknown as typeof process.stdout.write
    spies.push(vi.spyOn(process.stdout, 'write').mockImplementation(capture))
    spies.push(vi.spyOn(process.stderr, 'write').mockImplementation(capture))
    const dir = mkdtempSync(join(tmpdir(), 'never-break-'))
    server = await buildTestServer({
      dataStoreMode: 'database',
      dir,
      ...c.options(dir),
      beforeBoot: async (p) => {
        ids = await seedInstall(p)
        await c.beforeBoot?.(p)
      },
    })
    enableStatus = (
      await server.fastify.inject({
        method: 'POST',
        url: '/admin/platforms/accounting/bexio/enable',
        headers: admin,
        payload: {
          // bexio's getAuthUrl needs scopes: without them the OAuth start is a 500, not a 302.
          config: {
            clientId: 'id',
            clientSecret: 'secret',
            redirectUri: 'http://localhost/cb',
            scopes: ['openid'],
          },
        },
      })
    ).statusCode
  }, 60_000) // vitest's hookTimeout defaults to 10 s; buildServer in database mode can take longer under load

  afterAll(async () => {
    await server?.cleanup()
    for (const s of spies) s.mockRestore()
    delete process.env['ADMIN_SECRET']
  })

  it('[L7:N01] [L7:N02] boots, reports its state, and every never-gated surface answers', async () => {
    expect(server.license.current().state).toBe(c.state)
    const health = await get('/health')
    expect(health.statusCode).toBe(200)
    expect(health.json().status).toBe('ok')
    for (const url of ['/health/data-store', '/version', '/openapi/server-variables']) {
      expect((await get(url)).statusCode, url).toBe(200)
    }
    expect((await get('/admin/connections', admin)).statusCode).toBe(200)
  })

  it('[L7:G10] /admin/license reports the state, the usage, and never the token', async () => {
    const res = await get('/admin/license', admin)
    expect(res.statusCode).toBe(200)
    const s = res.json().data
    expect(s.state).toBe(c.state)
    if (c.reason) expect(s.reason).toBe(c.reason)
    expect(s.entitlementSource).toBe(c.community ? 'community' : 'license')
    if (c.community) expect(s.limits).toEqual({ connections: 1, tenants: 1 })
    expect(s.usage).toEqual({ connections: 3 })
    expect(res.body).not.toContain('v4.public.')
  })

  it('[L7:G10] /v1/capabilities answers an MCP key: only verticals, all 9 unless the license narrows them', async () => {
    const { plaintext } = await server.apiKeys.mint({ tenantId: 'default', scopes: ['mcp:read'] })
    const res = await get('/v1/capabilities', { authorization: `Bearer ${plaintext}` })
    expect(res.statusCode).toBe(200)
    const data = res.json().data as { verticals: string[] }
    expect(Object.keys(data)).toEqual(['verticals'])
    expect(data.verticals).toEqual(c.verticals ?? [...VERTICALS].sort())
  })

  it('[L7:N03] deletes nothing and exports every connection, including those above the cap', async () => {
    expect((await server.store.list()).map((r) => r.id).sort()).toEqual([...ids].sort())
    for (const id of ids) {
      const res = await get(
        `/admin/data/connections/${id}/resources/contacts/export?format=ndjson`,
        { ...admin, ...SCOPE },
      )
      expect(res.statusCode, id).toBe(200)
      expect(res.body.trim().split('\n'), id).toHaveLength(2)
    }
  })

  it('configuration stays writable, on a connection above the cap too', async () => {
    expect(enableStatus).toBe(200)
    const overCap = await overCapId()
    const patch = await server.fastify.inject({
      method: 'PATCH',
      url: `/admin/connections/${overCap}`,
      headers: admin,
      payload: { label: 'renamed' },
    })
    expect(patch.statusCode).toBe(200)
    const schedule = await server.fastify.inject({
      method: 'PUT',
      url: `/admin/connections/${overCap}/sync-schedule`,
      headers: admin,
      payload: { mode: 'trigger_only' },
    })
    expect(schedule.statusCode).toBe(200)
  })

  it('[L7:G09] a license refusal over HTTP is the structured envelope; a licensed deployment redirects', async () => {
    const res = await get('/auth/accounting/bexio/connect') // unauthenticated, as a browser starts it
    if (c.connectRefused ?? c.community) {
      expect(res.statusCode).toBe(403)
      const body = res.json()
      expect(typeof body.error).toBe('object')
      expect(body.error.code).toMatch(/^LICENSE_/)
    } else {
      expect(res.statusCode).toBe(302)
    }
  })

  it('an over-cap connection can be deleted: that is how an operator gets back under the limit', async () => {
    const overCap = await overCapId()
    expect(
      (
        await server.fastify.inject({
          method: 'DELETE',
          url: `/admin/connections/${overCap}`,
          headers: admin,
        })
      ).statusCode,
    ).toBe(204)
  })

  it('the token never reaches stdout or stderr, and the license state does', () => {
    const text = out.join('')
    expect(text).toContain(c.logLine)
    if (c.alsoLogs) expect(text).toContain(c.alsoLogs)
    if (c.token) {
      expect(text).not.toContain(c.token)
      expect(text).not.toContain(c.token.slice('v4.public.'.length, 'v4.public.'.length + 40))
    }
  })
})

describe('compose forwards unset license variables as empty strings', () => {
  it('[L7:N01] they count as unset: no token, and the default path next to STORE_PATH', () => {
    const dir = mkdtempSync(join(tmpdir(), 'license-env-'))
    expect(emptyComposeEnv(join(dir, 'store.db'))).toEqual({
      envToken: undefined,
      filePath: join(dir, 'license.key'),
    })
  })
})
