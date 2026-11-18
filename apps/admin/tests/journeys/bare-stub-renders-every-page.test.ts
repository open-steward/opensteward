/**
 * Every admin page renders against a stub that was told nothing.
 *
 * The shared
 * stub picks defaults from method names, and for six methods the name lies about
 * the shape — `getVerticals` returns a list despite `get*`, and five paginated
 * reads return a `{ data, meta }` envelope despite `list*`. Handing back a
 * plausible wrong value is worse than handing back nothing:
 *
 *   `const { data, meta } = await listConnectionsPaged(...)`  against `[]`
 *     -> both undefined -> 500 anchored to connections/index.ejs, with the
 *        stub's own "not stubbed" diagnostic never appearing, because the name
 *        matched the read prefix.
 *
 *   `verticals.some(v => v.adapterCount > 0)`  against `null`
 *     -> TypeError thrown *after* orEmpty, swallowed by the wizard preHandler's
 *        catch, and the nav rail silently stops rendering.
 *
 * `stub-matches-client.test.ts` checks the same thing statically, against the
 * client's declared return types. This checks it dynamically, by actually
 * rendering the pages — the two fail for different reasons, and a shape that is
 * declared correctly but consumed differently only shows up here.
 *
 * Deliberately no overrides. Any page needing one to render is a page whose
 * route reaches for something the stub cannot reasonably guess, and that is
 * worth knowing.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  // Nothing supplied. That is the point.
  return { AdminApiClient: adminApiStub({}) }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'bare-stub-renders-every-page-secret-long-enough'
let fastify: FastifyInstance

beforeEach(async () => {
  const built = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    session: { secret: SESSION_SECRET },
    admin_api: { url: 'http://localhost:3001' },
    docs_server: { url: 'http://localhost:3003' },
    sso: { publicBaseUrl: 'http://localhost:3000' },
  })
  fastify = built.fastify
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
})

const session = () =>
  fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }))

const get = (url: string) => fastify.inject({ method: 'GET', url, cookies: { session: session() } })

/** Pages whose routes consume a paginated envelope. */
const PAGINATED = [
  '/connections',
  '/customers',
  '/sync-jobs',
  '/audit',
  '/webhooks/whs_1/deliveries',
]

/** The rest of the admin's read surface. */
const PAGES = [
  '/',
  '/platforms',
  '/connect-links',
  '/connect-link-templates',
  '/scope-groups',
  '/api-keys',
  '/webhooks',
  '/users',
  '/tenants',
  '/notifications',
  '/company-info',
  '/settings',
  '/data',
  '/data/connections/conn-1',
  '/dashboards',
  '/dashboards/new',
  '/dashboards/builtin:overview',
  '/destinations',
  '/destinations/new',
  '/destinations/dest-1',
  '/sql-access',
  '/sql-access/principals/new',
]

describe('a stub told nothing still renders the admin', () => {
  it.each(PAGINATED)('renders %s, which destructures { data, meta }', async (url) => {
    // `[]` here yields undefined for both fields and 500s inside the template,
    // pointing at an EJS line rather than at the missing stub.
    const res = await get(url)
    expect(res.statusCode, `${url} -> ${res.statusCode}: ${res.body.slice(0, 200)}`).not.toBe(500)
  })

  it.each(PAGES)('renders %s', async (url) => {
    const res = await get(url)
    expect(res.statusCode, `${url} -> ${res.statusCode}: ${res.body.slice(0, 200)}`).not.toBe(500)
  })

  it('renders the /scope-groups filter row even with zero groups and no filter active', async () => {
    // A bare stub answers `listScopeGroups` and `listCatalog` with `[]` —
    // exactly the shape `scripts/screenshots/seed.ts`'s seedScopeGroup can
    // leave behind, since it swallows a non-2xx create response to a
    // warning rather than failing the seed run. The scope-groups-list
    // screenshot spec waits on `select[name="f_platform"]`; if that
    // selector only rendered inside a `groups.length > 0` branch,
    // `pnpm docs:screenshots` would hang against exactly this deployment
    // shape (fix-round-1, Critical 1's bundled deferred minor).
    const res = await get('/scope-groups')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="f_platform"')
    expect(res.body).toContain('No scope groups yet.')
  })

  it('renders the wizard with its rail intact', async () => {
    // The silent half. `getVerticals` answering null makes computeWizardProgress
    // throw past orEmpty into the preHandler's catch; the page still returns
    // 200, and the rail is simply gone. Asserting the status alone would miss it.
    const res = await get('/setup/wizard?stay=1')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('wizard-rail__list')
    expect((res.body.match(/wizard-rail__label/g) ?? []).length).toBe(8)
  })

  it('reaches every wizard step without a 500', async () => {
    for (const step of [
      '/setup/wizard/company-info',
      '/setup/wizard/logos',
      '/setup/wizard/platforms',
      '/setup/wizard/configure',
      '/setup/wizard/tenants',
      '/setup/wizard/api-key',
      '/setup/wizard/webhooks',
    ]) {
      const res = await get(step)
      expect(res.statusCode, `${step} -> ${res.statusCode}`).not.toBe(500)
    }
  })
})
