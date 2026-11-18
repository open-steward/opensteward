/**
 * Journey: sorting and per-column filtering on /audit.
 *
 * /audit is the only table in this feature with true SQL pagination — tens of
 * thousands of rows, LIMIT/OFFSET at the store, an honest `countAudit` — so
 * the two assertions that matter most here are about what leaves this route,
 * not about what it renders:
 *
 *   1. `sort`, `dir` and every filter are FORWARDED to admin-api rather than
 *      applied to the fifty rows already in hand. A route that sorted locally
 *      would pass every rendering assertion below while reordering 50 rows out
 *      of 40,000 under a control that claims to speak for all of them.
 *
 *   2. The EXPORT link is built from the legacy param names, not from
 *      `tableQs`. `/audit/export` reads `action`/`user_id`/`target_id`/
 *      `vertical`/`from`/`to`; the table emits `f_action`/`f_user`/`f_target`.
 *      An export link built from `tableQs` carries names the export endpoint
 *      recognises none of, so it silently exports the WHOLE audit log while
 *      the operator believes they exported what is on screen — no error, and a
 *      file that looks plausible until someone counts the rows. That test
 *      compares the parsed query params exactly, not by substring: `f_action=x`
 *      CONTAINS `action=x`, so a `toContain` assertion would pass against the
 *      exact bug it exists to catch.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockListAudit = vi.fn()
const mockListAuditActions = vi.fn()
const mockExportAudit = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listAudit: mockListAudit,
      listAuditActions: mockListAuditActions,
      exportAudit: mockExportAudit,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      getCompanyInfo: async () => null,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'audit-sort-filter-session-secret-long-enough'
const ACTIONS = ['user.login', 'connection.delete', 'api_key.mint']
const ENTRY = {
  id: 12,
  userId: 'usr-1',
  username: 'olivia',
  action: 'user.login',
  vertical: 'accounting',
  targetId: 'conn-abc',
  detail: null,
  createdAt: '2026-02-01T10:00:00.000Z',
}

let fastify: FastifyInstance

beforeEach(async () => {
  mockListAuditActions.mockReset().mockResolvedValue(ACTIONS)
  mockExportAudit.mockReset().mockResolvedValue({ body: 'id\n', contentType: 'text/csv' })
  mockListAudit.mockReset().mockResolvedValue({
    data: [ENTRY],
    meta: { page: 1, limit: 50, total: 1 },
  })
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

function get(url: string) {
  const cookie = fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
  return fastify.inject({ method: 'GET', url, cookies: { session: cookie } })
}

/** The query params of one export link, parsed — never substring-matched. */
function exportParams(body: string, format: 'csv' | 'json'): URLSearchParams {
  const m = body.match(new RegExp(`href="([^"]*/audit/export[^"]*format=${format})"`))
  if (!m) throw new Error(`no ${format} export link in the rendered page`)
  return new URLSearchParams(m[1].replace(/&amp;/g, '&').split('?')[1] ?? '')
}

describe('Journey: sorting and filtering the audit table', () => {
  it('forwards sort, dir and every filter under its admin-api name rather than applying them locally', async () => {
    await get(
      '/audit?sort=action&dir=desc&f_user=olivia&f_action=user.login&f_vertical=crm&f_target=abc123&f_from=2026-01-01&f_to=2026-02-01',
    )
    expect(mockListAudit).toHaveBeenCalledWith(
      'jwt',
      1,
      50,
      {
        user_id: 'olivia',
        action: 'user.login',
        vertical: 'crm',
        target_id: 'abc123',
        from: '2026-01-01',
        to: '2026-02-01',
      },
      'action',
      'desc',
    )
  })

  it('sends no sort at all when none was asked for', async () => {
    await get('/audit')
    expect(mockListAudit).toHaveBeenCalledWith('jwt', 1, 50, {}, undefined, undefined)
  })

  it('ignores an unrecognised sort key rather than forwarding it', async () => {
    // The admin side allow-lists against its own spec before admin-api ever
    // sees the value, so a stale bookmark renders the default order.
    await get('/audit?sort=detail&dir=desc')
    expect(mockListAudit).toHaveBeenCalledWith('jwt', 1, 50, {}, undefined, undefined)
  })

  it.each([
    ['?action=user.login', { action: 'user.login' }],
    ['?user_id=olivia', { user_id: 'olivia' }],
    ['?target_id=conn-abc', { target_id: 'conn-abc' }],
    ['?from=2026-01-01&to=2026-02-01', { from: '2026-01-01', to: '2026-02-01' }],
  ])('a bookmarked %s still narrows through the legacy alias', async (qs, expected) => {
    // `?action=` and `?user_id=` are both linked from views/users/detail.ejs
    // today; the rest are what the old above-table filter card emitted.
    await get(`/audit${qs}`)
    expect(mockListAudit).toHaveBeenCalledWith('jwt', 1, 50, expected, undefined, undefined)
  })

  it('renders exactly the five documented columns, header and body', async () => {
    // The counts are LITERAL, not derived from `tableSpec`: a header-vs-body
    // check that computes both sides from the same spec catches the two rows
    // drifting apart but never a wrong column list, which is the change more
    // likely to be made by accident.
    const body = (await get('/audit')).body
    const headerRow = body.slice(
      body.indexOf('<tr class="table__headers'),
      body.indexOf('<tr class="table__filters"'),
    )
    expect((headerRow.match(/<th[ >]/g) ?? []).length).toBe(5)
    const tbody = body.indexOf('<tbody>')
    const firstRow = body.slice(tbody, body.indexOf('</tr>', tbody))
    expect((firstRow.match(/<td[ >]/g) ?? []).length).toBe(5)
    for (const header of ['Time', 'User', 'Action', 'Vertical', 'Target']) {
      expect(body).toContain(`>${header}<`)
    }
  })

  it('makes every column a sort link carrying its own key', async () => {
    const body = (await get('/audit')).body
    for (const key of ['time', 'user', 'action', 'vertical', 'target']) {
      expect(body).toContain(`href="/audit?sort=${key}&amp;dir=asc"`)
    }
  })

  it('renders a filter control for each filterable column', async () => {
    const body = (await get('/audit')).body
    for (const header of ['User', 'Action', 'Vertical', 'Target']) {
      expect(body).toContain(`aria-label="Filter by ${header}"`)
    }
    // Time's filter is the date range above the table, not a box in the row.
    expect(body).not.toContain('aria-label="Filter by Time"')
  })

  it('keeps the date range above the table, associated with the filter form and emitted once', async () => {
    const body = (await get('/audit?f_from=2026-01-01&f_to=2026-02-01').then((r) => r))
    expect(body.body).toContain('form="audit-filters" name="f_from" id="f_from" value="2026-01-01"')
    // `rendered: true` on those two columns is what stops _table-filters-form
    // ALSO emitting a hidden mirror: two controls of one name submit twice,
    // last value wins, and clearing the visible box would be undone.
    expect((body.body.match(/name="f_from"/g) ?? []).length).toBe(1)
    expect((body.body.match(/name="f_to"/g) ?? []).length).toBe(1)
  })

  it('keeps a retired action selectable rather than resetting the view to All', async () => {
    // Second guard on _table-head.ejs's out-of-options branch: the action list
    // is what the registry knows NOW, and rows outlive a retired code.
    const body = (await get('/audit?f_action=legacy.retired')).body
    expect(body).toMatch(/<option value="legacy\.retired" selected>/)
  })

  it('carries an active filter into the pagination link, and renders admin-api\'s page', async () => {
    mockListAudit.mockResolvedValue({ data: [ENTRY], meta: { page: 2, limit: 1, total: 3 } })
    const body = (await get('/audit?f_target=abc123&page=2')).body
    // NOT a bare /f_target=abc123/ match: every sortable header link already
    // serialises every active filter. The `...&page=N` suffix is unique to
    // _pagination.ejs, which no `sortHref` ever emits.
    expect(body).toMatch(/f_target=abc123&amp;page=3/)
    expect(body).toContain('Page 2 of 3')
    // The BASE of that link, not just its query string. This view hardcoded
    // `baseUrl: '/audit'` where its three siblings read `tableSpec.baseUrl`,
    // and nothing noticed: pointing it at any other path left this file green,
    // because every other assertion here matches on the query string alone.
    expect(body).toMatch(/href="\/audit\?[^"]*page=3"/)
    expect(body).toMatch(/href="\/audit\?[^"]*page=1"/)
  })
})

describe('Journey: the /audit export link', () => {
  // The sharpest test in this task. See this file's header for why.
  it('builds the export href from the legacy param names, not from tableQs', async () => {
    const body = (await get('/audit?f_action=user.login&f_target=abc123')).body
    const csv = exportParams(body, 'csv')
    expect(csv.get('action')).toBe('user.login')
    expect(csv.get('target_id')).toBe('abc123')
    // Exact key set: `f_action=user.login` CONTAINS `action=user.login`, so a
    // substring assertion would pass against the very bug this catches.
    expect([...csv.keys()]).toEqual(['action', 'target_id', 'format'])
  })

  it('does the same for the JSON export', async () => {
    const json = exportParams((await get('/audit?f_action=user.login&f_target=abc123')).body, 'json')
    expect([...json.keys()]).toEqual(['action', 'target_id', 'format'])
    expect(json.get('action')).toBe('user.login')
  })

  it('maps every filter key, including the two the date range owns', async () => {
    const body = (await get('/audit?f_user=olivia&f_vertical=crm&f_from=2026-01-01&f_to=2026-02-01'))
      .body
    const csv = exportParams(body, 'csv')
    expect([...csv.keys()]).toEqual(['user_id', 'vertical', 'from', 'to', 'format'])
  })

  it('carries no page, sort or dir — an export is neither paginated nor reordered', async () => {
    const body = (await get('/audit?sort=action&dir=desc&page=3&f_action=user.login')).body
    const csv = exportParams(body, 'csv')
    expect([...csv.keys()]).toEqual(['action', 'format'])
  })

  it('exports everything when nothing is filtered', async () => {
    expect([...exportParams((await get('/audit')).body, 'csv').keys()]).toEqual(['format'])
  })

  // Same silent-whole-log-export class as the tableQs bug above, one hop
  // later: an array value here reaches axios, which serialises it as
  // `action[]=…`, which admin-api does not declare — so the filter is dropped
  // and the ENTIRE audit log comes back while the operator believes they
  // downloaded a slice. Only reachable by hand-crafting the URL, which is also
  // true of every other bug this task closed.
  it('collapses a repeated filter on the export route rather than shipping an array', async () => {
    const res = await get('/audit/export?format=csv&action=user.login&action=other')
    expect(res.statusCode).toBe(200)
    expect(mockExportAudit).toHaveBeenCalledWith('jwt', 'csv', { action: 'other' })
  })

  it('collapses a repeated format too, last wins', async () => {
    // Deliberately `csv` THEN `json`, not the other way round. With
    // `json&format=csv` the expected answer is `csv`, which is also what the
    // handler's own `=== 'json' ? … : 'csv'` default produces when it is
    // handed the raw ARRAY — so that ordering passes whether or not `one()`
    // is called at all, and this test would have guarded nothing. Asking for
    // the NON-default value last is what makes the collapse observable.
    await get('/audit/export?format=csv&format=json')
    expect(mockExportAudit).toHaveBeenCalledWith('jwt', 'json', {})
  })

  it('forwards those legacy names on to admin-api when the link is followed', async () => {
    // The other half of the round trip: /audit/export must READ exactly the
    // names /audit writes, or the link is correct and the endpoint still
    // ignores it — the same silent whole-log export, one hop later.
    const res = await get('/audit/export?format=csv&action=user.login&target_id=abc123&vertical=crm')
    expect(res.statusCode).toBe(200)
    expect(mockExportAudit).toHaveBeenCalledWith('jwt', 'csv', {
      action: 'user.login',
      target_id: 'abc123',
      vertical: 'crm',
    })
  })
})

describe('Journey: /audit with a filter that matches nothing', () => {
  beforeEach(() => {
    mockListAudit.mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0 } })
  })

  it('keeps the table, the filter row and a Clear control on screen', async () => {
    const res = await get('/audit?f_target=nope')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('aria-label="Filter by Target"')
    // Anchored to the href, NOT a bare toContain('Clear'): the empty state
    // below carries its own "Clear filters" anchor, so deleting the top-level
    // control entirely leaves a bare text match green.
    expect(res.body).toContain('href="/audit">Clear<')
  })

  it('names an exact-match filter back, because a text box implies a substring', async () => {
    const body = (await get('/audit?f_target=nope')).body
    expect(body).toContain('Target id matches exactly — paste the whole id.')
    expect(body).not.toContain('No audit entries yet')
  })

  it('says the User box is exact too', async () => {
    const body = (await get('/audit?f_user=ghost')).body
    expect(body).toContain('User matches a username or a user id exactly.')
  })

  it('reads as an empty install only when nothing is filtered', async () => {
    const body = (await get('/audit')).body
    expect(body).toContain('No audit entries yet')
    expect(body).not.toContain('href="/audit">Clear<')
  })
})
