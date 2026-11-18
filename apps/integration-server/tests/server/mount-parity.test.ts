import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The `/v1/me/*` (end-user) mounts must be configured identically to their
 * `/v1/*` (tenant) counterparts.
 *
 * They were not. Every tenant mount passed `rawPayloadEnabled`; every end-user
 * mount omitted it. `bind()` in cached-router-helpers treats an absent policy
 * as "keep everything", so the raw-payload privacy control was fully bypassed
 * on the end-user surface — which is the surface MCP agents use.
 *
 * That control is not cosmetic. `strip-raw-payload.ts` exists because two
 * verticals carry financial identifiers the canonical schema deliberately does
 * not expose: payments (`bank_account`, `iban`, `cardNumber` across 88/22/16
 * adapters, where the schema offers only `last4`) and accounting (17 adapters
 * declaring `iban`/`bank_account`/`routing_number`, where `metadata` IS the
 * payload). Both are opt-in and default OFF. Both were among the five mounts
 * missing the policy.
 *
 * How it stayed hidden: the ResourceStore received the policy, so cached rows
 * were stripped correctly and the store looked right. Only the live response
 * leaked, and only on `/v1/me`. It surfaced from the opposite direction —
 * chasing why a cached record had no `metadata` when the live one did.
 *
 * A source-level check because the alternative is booting both mounts for nine
 * verticals; the failure mode here is a forgotten argument, which reading the
 * registration catches exactly.
 */

const SERVER_SRC = readFileSync(join(__dirname, '../../src/server.ts'), 'utf8')

/** Options that change what a caller can SEE, and so must never differ. */
const SECURITY_RELEVANT_OPTIONS = ['rawPayloadEnabled']

interface Mount {
  vertical: string
  options: string
}

/**
 * The end-user registrations live in one block below a comment marker, so the
 * two tiers are split by position rather than by trying to distinguish `/v1/`
 * from `/v1/me/` with a regex — `/v1/` prefix-matches both.
 */
const END_USER_MARKER = '/v1/me/{vertical}/{resource}'

const MOUNT_RE = /create(\w+)Plugin\(\{([\s\S]*?)\}\),\s*\n?\s*\{ prefix: `\/v1/g

function mountsIn(source: string): Mount[] {
  return [...source.matchAll(MOUNT_RE)].map((m) => ({ vertical: m[1]!, options: m[2]! }))
}

const splitAt = SERVER_SRC.indexOf(END_USER_MARKER)

const TENANT = mountsIn(SERVER_SRC.slice(0, splitAt))
const END_USER = mountsIn(SERVER_SRC.slice(splitAt))

describe('mount discovery', () => {
  it('finds both tiers', () => {
    // Guards the guard — a regex that matched nothing would pass everything.
    expect(splitAt).toBeGreaterThan(0)
    expect(TENANT.length).toBeGreaterThanOrEqual(5)
    expect(END_USER.length).toBeGreaterThanOrEqual(5)
  })
})

describe('end-user mounts carry the same data-store policy as tenant mounts', () => {
  it.each(SECURITY_RELEVANT_OPTIONS)(
    'every /v1/me mount passes `%s`, as every /v1 mount does',
    (option) => {
      const missing = END_USER.filter((m) => !m.options.includes(option)).map((m) => m.vertical)
      expect(missing).toEqual([])
    },
  )

  it('no vertical is mounted on /v1/me without also being on /v1', () => {
    const tenantVerticals = new Set(TENANT.map((m) => m.vertical))
    const orphans = END_USER.filter((m) => !tenantVerticals.has(m.vertical)).map((m) => m.vertical)
    expect(orphans).toEqual([])
  })

  it('the accounting and payments mounts in particular carry it', () => {
    // Named explicitly: these are the only two verticals `strip-raw-payload`
    // actually filters, so a regression here is the one that leaks.
    for (const vertical of ['Accounting', 'Payments']) {
      const mount = END_USER.find((m) => m.vertical === vertical)
      expect(mount, `${vertical} is not mounted on /v1/me`).toBeDefined()
      expect(mount!.options).toContain('rawPayloadEnabled')
    }
  })
})

describe('every vertical mount is license-gated (P6)', () => {
  it('passes licenseGate on every /v1 and /v1/me mount', () => {
    expect(
      [...TENANT, ...END_USER]
        .filter((m) => !/\blicenseGate: verticalGate\b/.test(m.options))
        .map((m) => m.vertical),
    ).toEqual([])
  })
  it('and on every sandbox (/test/v1) plugin', () => {
    const start = SERVER_SRC.indexOf('const SANDBOX_PLUGINS')
    expect(start).toBeGreaterThan(0)
    const block = SERVER_SRC.slice(start, SERVER_SRC.indexOf('\n  }\n', start))
    const plugins = block.match(/create\w+Plugin\(\{/g) ?? []
    expect(plugins).toHaveLength(9)
    expect(block.match(/licenseGate: verticalGate/g) ?? []).toHaveLength(plugins.length)
  })
  it('and on the sandbox simulated sync, which is mounted beside each plugin', () => {
    const start = SERVER_SRC.indexOf('createSandboxSyncRouter({')
    expect(start).toBeGreaterThan(0)
    const options = SERVER_SRC.slice(start, SERVER_SRC.indexOf('})', start))
    expect(options).toContain('licenseGate: verticalGate(vertical)')
  })

  /**
   * Passing the gate proves nothing if the plugin never hooks it in, and the
   * compiler does not flag an option a plugin accepts and ignores. So read
   * each plugin: the gate must be the hook directly after authMiddleware (401
   * before 403).
   */
  const VERTICALS_DIR = join(__dirname, '../../src/verticals')
  const PLUGINS = readdirSync(VERTICALS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(VERTICALS_DIR, d.name, 'index.ts')))
    .map((d) => d.name)
    .sort()

  it('finds all nine vertical plugins', () => {
    expect(PLUGINS).toEqual([
      'accounting',
      'crm',
      'customer-support',
      'docsign',
      'ecommerce',
      'inventory',
      'logistics',
      'payments',
      'projects',
    ])
  })

  it.each(PLUGINS)('the %s plugin hooks the gate in, right after authMiddleware', (vertical) => {
    const lines = readFileSync(join(VERTICALS_DIR, vertical, 'index.ts'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
    const auth = lines.indexOf("app.addHook('preHandler', opts.authMiddleware)")
    expect(auth, 'no authMiddleware hook').toBeGreaterThan(0)
    expect(lines.lastIndexOf("app.addHook('preHandler', opts.authMiddleware)")).toBe(auth)
    expect(lines[auth + 1]).toBe("app.addHook('preHandler', opts.licenseGate(VERTICAL))")
  })
})
