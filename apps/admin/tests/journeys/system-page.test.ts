/**
 * The System page, read the way an operator who installs published releases
 * reads it: which release is running, is every service up, did the last
 * upgrade finish. Per-service build detail is collapsed under Technical
 * details, for bug reports; schema migrations are not on the page at all.
 *
 * The cross-service fan-out is replaced (`createVersionInfoCollector`), but
 * `summarizeSystem` is the real one — this is the page's verdict end to end.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Test-only: the admin UI's src imports nothing from licensing (it reads admin-api's wire).
import { LICENSE_ERROR_CODES, LICENSE_INVALID_REASONS } from '@opensteward/shared/licensing'
import type { VersionEntry, VersionInfo } from '../../src/core/version-info'
import { COMMUNITY, licenseRecord } from '../helpers/license'

let current: VersionInfo
const mockGetSchemaStatus = vi.fn()
const mockGetLicense = vi.fn()

vi.mock('../../src/core/version-info', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/version-info')>(
    '../../src/core/version-info',
  )
  return { ...actual, createVersionInfoCollector: () => async () => current }
})

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getSchemaStatus: mockGetSchemaStatus,
      getLicense: mockGetLicense,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'system-page-session-secret-long-enough'
let fastify: FastifyInstance

function entry(name: string, over: Partial<VersionEntry> = {}): VersionEntry {
  return {
    name,
    version: '1.0.0',
    release: '0.1.0',
    gitSha: '3d0378c60aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    buildTime: '2026-10-06T12:00:00Z',
    ...over,
  }
}
function released(over: Partial<VersionInfo> = {}): VersionInfo {
  return {
    admin: entry('admin'),
    'admin-api': entry('admin-api'),
    'integration-server': entry('integration-server'),
    'docs-server': entry('docs-server'),
    'webhook-gateway': entry('webhook-gateway'),
    ...over,
  }
}

function get(url: string, role: 'viewer' | 'operator' | 'admin' = 'admin') {
  const session = fastify.signCookie(
    JSON.stringify({ id: 'u1', username: role, role, token: 'jwt' }),
  )
  return fastify.inject({ method: 'GET', url, cookies: { session } })
}

beforeEach(async () => {
  current = released()
  mockGetSchemaStatus.mockReset()
  mockGetLicense.mockReset().mockResolvedValue(null)
  const built = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    session: { secret: SESSION_SECRET },
    admin_api: { url: 'http://localhost:3001' },
    docs_server: { url: 'http://docs.example.test' },
    sso: { publicBaseUrl: 'http://localhost:3000' },
  })
  fastify = built.fastify
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
})

describe('System page', () => {
  it('leads with the release, its notes, and how to upgrade', async () => {
    const res = await get('/settings/system')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('OpenSteward 0.1.0</h2>')
    expect(res.body).toContain(
      'href="https://github.com/open-steward/opensteward/releases/tag/platform%2Fv0.1.0"',
    )
    expect(res.body).toContain('>Release notes for 0.1.0</a>')
    expect(res.body).toContain('href="https://github.com/open-steward/opensteward/releases"')
    expect(res.body).toContain('href="http://docs.example.test/guides/deployment/upgrading.md"')
    expect(res.body).not.toContain('Development build')
    expect(res.body).not.toContain('alert--danger')
    expect(res.body).not.toContain('alert--warning')
  })

  it('lists every service as Running, without per-service versions up front', async () => {
    const res = await get('/settings/system')
    for (const name of [
      'Admin console',
      'Admin API',
      'Integration server',
      'Docs',
      'Webhook gateway',
    ]) {
      expect(res.body, name).toContain(`<td>${name}</td>`)
    }
    const services = res.body.slice(0, res.body.indexOf('data-technical-details'))
    expect(services.match(/>Running</g)).toHaveLength(5)
    // The release column only appears when services disagree.
    expect(services).not.toContain('<th scope="col">Release</th>')
  })

  it('names a service that is not responding', async () => {
    current = released({ 'integration-server': null })
    const res = await get('/settings/system')
    expect(res.body).toContain('<strong>Integration server is not responding.</strong>')
    expect(res.body).toMatch(/data-service="integration-server">[\s\S]*?Not responding/)
  })

  it('warns that an upgrade is unfinished when services report different releases', async () => {
    current = released({ 'integration-server': entry('integration-server', { release: '0.2.0' }) })
    const res = await get('/settings/system')
    expect(res.body).toContain('Services are running different releases (0.1.0, 0.2.0).')
    expect(res.body).toContain('<th scope="col">Release</th>')
    expect(res.body).toContain('OpenSteward 0.1.0 / 0.2.0</h2>')
  })

  it('labels a build made from source and links to the changelog instead of a release', async () => {
    current = Object.fromEntries(
      Object.entries(released()).map(([k, v]) => [
        k,
        v && { ...v, gitSha: 'dev', buildTime: 'dev' },
      ]),
    ) as VersionInfo
    const res = await get('/settings/system')
    expect(res.body).toContain('Development build')
    expect(res.body).toContain(
      'href="https://github.com/open-steward/opensteward/blob/main/CHANGELOG.md"',
    )
    expect(res.body).not.toContain('Release notes for')
  })

  it('keeps build detail in a closed Technical details block, with a bug-report copy', async () => {
    current = released({
      'admin-api': entry('admin-api', { version: '1.4.2', gitSha: 'f00dfeed' }),
    })
    const res = await get('/settings/system')
    expect(res.body).toMatch(/<details class="card"[^>]*data-technical-details>/)
    expect(res.body).not.toMatch(/<details[^>]*data-technical-details[^>]*\sopen/)
    const copy = res.body.match(/data-copy="([^"]*)">Copy for a bug report/)
    expect(copy).not.toBeNull()
    expect(copy![1]).toContain('OpenSteward 0.1.0')
    expect(copy![1]).toContain('admin-api: release 0.1.0, version 1.4.2, git f00dfeed')
  })

  it('no longer shows schema migrations, or asks admin-api for them', async () => {
    const res = await get('/settings/system')
    expect(res.body).not.toContain('Schema versions')
    expect(res.body).not.toContain('_schema_migrations')
    expect(mockGetSchemaStatus).not.toHaveBeenCalled()
  })

  it('stays admin-only', async () => {
    const res = await get('/settings/system', 'operator')
    expect(res.statusCode).toBe(403)
  })
})

describe('System page — License', () => {
  it('shows a valid license, its usage, verticals and source, with no alert', async () => {
    mockGetLicense.mockResolvedValue(licenseRecord())
    const res = await get('/settings/system')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('data-license-state="VALID"')
    expect(res.body).toContain('Acme Forsakring AB')
    expect(res.body).toContain('2027-10-06 (362 days left)')
    expect(res.body).toContain('3 of 5')
    expect(res.body).toContain('1 of 1, counting &#39;default&#39;')
    expect(res.body).toContain('accounting, crm')
    expect(res.body).toContain('/etc/opensteward/license/license.key')
    expect(res.body).not.toContain('data-license-alert')
    expect(mockGetLicense).toHaveBeenCalledWith('jwt')
  })

  it('shows a 1,000,000 limit as Unlimited, never as the number', async () => {
    mockGetLicense.mockResolvedValue(
      licenseRecord({ tier: 'pro', limits: { connections: 1_000_000, tenants: 1_000_000 } }),
    )
    const res = await get('/settings/system')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Unlimited (3 in use)')
    expect(res.body).toContain('Unlimited (1 registered, counting &#39;default&#39;)')
    expect(res.body).not.toContain('1000000')
  })

  it.each([
    [
      'EXPIRING',
      { daysRemaining: 12, expiresAt: '2026-10-21T17:00:00.000Z' },
      'alert--warning',
      'The license expires in 12 days, on 2026-10-21.',
    ],
    [
      'GRACE',
      {
        daysRemaining: -3,
        expiresAt: '2026-10-06T17:00:00.000Z',
        graceEndsAt: '2026-11-05T17:00:00.000Z',
      },
      'alert--danger',
      'Everything keeps working until 2026-11-05',
    ],
    [
      'DEGRADED',
      { ...COMMUNITY, reason: 'EXPIRED', expiresAt: '2026-08-01T17:00:00.000Z' },
      'alert--danger',
      'Running in community mode: 1 connection and 1 tenant.',
    ],
    [
      'INVALID',
      { ...COMMUNITY, reason: 'BAD_SIGNATURE' },
      'alert--danger',
      'The installed license is not valid (BAD_SIGNATURE).',
    ],
    ['MISSING', { ...COMMUNITY, source: 'none' }, 'alert--warning', 'No license is installed.'],
  ] as const)('%s raises its alert, linking the renewal URL', async (state, over, tone, text) => {
    mockGetLicense.mockResolvedValue(licenseRecord({ state, ...over }))
    const res = await get('/settings/system')
    expect(res.body).toContain(
      `<div class="alert ${tone}" role="status" data-license-alert="${state}"`,
    )
    expect(res.body).toContain(text)
    expect(res.body).toContain('href="https://opensteward.dev/license"')
  })

  it('unknown is shown as unknown, never as "no license", and the page still renders', async () => {
    mockGetLicense.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:3001'))
    const res = await get('/settings/system')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('data-license-unavailable')
    expect(res.body).not.toContain('No license is installed')
    expect(res.body).not.toContain('data-license-alert')
  })

  it("shows admin-api's reason, which names ADMIN_SECRET when that is the cause", async () => {
    mockGetLicense.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 503'), {
        response: {
          status: 503,
          data: {
            error: {
              code: 'LICENSE_STATUS_UNAVAILABLE',
              message:
                'The license status is not available: integration-server has no ADMIN_SECRET, so it refuses admin-api (ADMIN_DISABLED).',
            },
          },
        },
      }),
    )
    const res = await get('/settings/system')
    expect(res.body).toContain('data-license-unavailable')
    expect(res.body).toContain('integration-server has no ADMIN_SECRET')
  })

  it('a status this console cannot read costs the card, not the page', async () => {
    // Version skew: a 200 whose record lacks fields the card needs (here limits and usage).
    const { limits: _l, usage: _u, ...partial } = licenseRecord({ state: 'MISSING', ...COMMUNITY })
    mockGetLicense.mockResolvedValue(partial)
    const res = await get('/settings/system')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('data-license-unavailable')
    expect(res.body).toContain('admin-api answered with a license status this console cannot read')
    expect(res.body).not.toContain('data-license-alert')
    expect(res.body).toContain('OpenSteward 0.1.0</h2>')
  })

  it('the card links the renewal URL admin-api reports, not one of its own', async () => {
    mockGetLicense.mockResolvedValue(
      licenseRecord({ renewalUrl: 'https://licenses.example.test/renew' }),
    )
    const body = (await get('/settings/system')).body
    expect(body).toMatch(/href="https:\/\/licenses\.example\.test\/renew"[^>]*data-license-link/)
    expect(body).not.toContain('opensteward.dev/license')
  })

  it('names the license file OPENSTEWARD_LICENSE shadows', async () => {
    mockGetLicense.mockResolvedValue(
      licenseRecord({
        source: 'env',
        filePath: undefined,
        shadowedFile: '/etc/opensteward/license/license.key',
      }),
    )
    const body = (await get('/settings/system')).body
    expect(body).toContain('OPENSTEWARD_LICENSE (environment variable)')
    expect(body).toContain(
      'OPENSTEWARD_LICENSE is set, so the license file /etc/opensteward/license/license.key is ignored: renewing that file changes nothing until OPENSTEWARD_LICENSE is unset.',
    )
  })

  it.each([
    ['missing', 'carries no license revocation list, so revoked licenses cannot be detected'],
    ['invalid', 'license revocation list did not verify, so revoked licenses cannot be detected'],
  ] as const)(
    'notes a revocation list that is %s on the card (review r9)',
    async (revocationList, note) => {
      mockGetLicense.mockResolvedValue(licenseRecord({ revocationList }))
      const body = (await get('/settings/system')).body
      expect(body).toContain(note)
      expect(body).toContain('Upgrade to a current release.')
    },
  )

  it('renders when admin-api does not report a license (an older admin-api: 404 → null)', async () => {
    mockGetLicense.mockResolvedValue(null)
    const res = await get('/settings/system')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('data-license-unavailable')
  })

  it('says when the status is last-known', async () => {
    mockGetLicense.mockResolvedValue(
      licenseRecord({ stale: true, fetchedAt: '2026-10-09T12:00:05.000Z' }),
    )
    expect((await get('/settings/system')).body).toContain(
      'Last known status, from 2026-10-09 12:00 UTC',
    )
  })

  it('links the license guide on the docs server', async () => {
    mockGetLicense.mockResolvedValue(licenseRecord())
    const res = await get('/settings/system')
    expect(res.body).toContain(
      'href="http://docs.example.test/guides/deployment/license.md" data-license-guide',
    )
  })

  it('links a license guide that exists in docs/', async () => {
    mockGetLicense.mockResolvedValue(licenseRecord())
    const href = /href="([^"]+)" data-license-guide/.exec((await get('/settings/system')).body)?.[1]
    expect(href).toBe('http://docs.example.test/guides/deployment/license.md')
    const file = resolve(
      __dirname,
      '../../../../docs',
      href!.replace('http://docs.example.test/guides/', ''),
    )
    expect(existsSync(file)).toBe(true)
  })

  it('the guide names every INVALID reason and every license error code (I19)', () => {
    const guide = readFileSync(resolve(__dirname, '../../../../docs/deployment/license.md'), 'utf8')
    const missing = [...LICENSE_INVALID_REASONS, ...Object.values(LICENSE_ERROR_CODES)].filter(
      (name) => !guide.includes(`\`${name}\``),
    )
    expect(missing).toEqual([])
  })
})

describe('/api/version-info', () => {
  it('returns the collector’s map, release included, for the sidebar footer', async () => {
    const res = await get('/api/version-info')
    expect(res.statusCode).toBe(200)
    expect(res.json().admin).toMatchObject({ name: 'admin', release: '0.1.0' })
  })
})
