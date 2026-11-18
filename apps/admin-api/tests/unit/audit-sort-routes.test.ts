/**
 * `GET /api/audit?sort=&dir=&vertical=` — the HTTP surface over the SQL
 * ordering pinned in audit-sort-store.test.ts.
 *
 * Two properties this endpoint has that the store test cannot see:
 *
 *   - **`sort`/`dir` are `z.string().optional()`, never `z.enum`.** An
 *     unrecognised value must render the table in its default order, not 400.
 *     A stale bookmark and a hand-edited URL are the same request as far as
 *     Fastify is concerned, and `?sort=created_at desc` / `?sort=__proto__`
 *     were both unhandled 500s before the allow-list existed.
 *   - **`vertical` goes into `auditWhere`, the helper `listAudit`, `countAudit`
 *     and `iterateAudit` all share.** Added to `listAudit` alone it would page
 *     over a narrowed set while `meta.total` counted the whole log — the
 *     header would say 40,000 while the table showed 3, and the operator would
 *     believe the filter had failed rather than that the count had.
 *
 * The store test proves the ORDER; this proves the route actually reaches it
 * (a handler that dropped `sort` on the floor would still answer 200 with a
 * correctly-ordered default page, which is why the reorder assertion here
 * compares against the default rather than merely checking the status code).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { openDb, type DbHandle } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { isoifyTimestamps, enrichErrorBody } from '../../src/core/routes/_openapi'
import { createAuditRoutes } from '../../src/core/routes/audit'

let app: FastifyInstance
let handle: DbHandle
let store: AdminStore

/** Fixture rows. `target_id` is the readable handle each assertion works in;
 *  `action` deliberately mixes case-adjacent values so a wrong sort shows up
 *  as a different sequence rather than the same one twice. */
const ROWS = [
  {
    user_id: 'usr-mike',
    action: 'user.login',
    vertical: 'accounting',
    target_id: 'r-alpha',
    created_at: 100,
  },
  {
    user_id: 'usr-zoe',
    action: 'api_key.mint',
    vertical: 'CRM',
    target_id: 'r-bravo',
    created_at: 300,
  },
  {
    user_id: 'usr-adam',
    action: 'connection.delete',
    vertical: null,
    target_id: 'r-charlie',
    created_at: 200,
  },
]

beforeEach(async () => {
  handle = await openDb({ sqlitePath: ':memory:' })
  store = await AdminStore.create(handle)
  // Boot writes a `schema.migrate` row; clear it so the assertions below are
  // over the fixture set alone.
  await store.pruneAuditLogBefore(Date.now() + 60_000)
  for (const r of ROWS) {
    await handle.kysely
      .insertInto('audit_log')
      .values({ detail: null, ...r })
      .execute()
  }

  app = Fastify({ logger: false })
  await registerOpenApiBridge(app)
  app.addHook('preSerialization', async (request, reply, payload) =>
    isoifyTimestamps(enrichErrorBody(payload, reply.statusCode, String(request.id))),
  )
  await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  app.decorate('authenticate', requireAuth)
  app.decorate('operatorOnly', requireRole('operator'))
  app.decorate('adminOnly', requireRole('admin'))
  await app.register(createAuditRoutes(store))
  await app.ready()
})

afterEach(async () => {
  await app?.close()
  await store?.close()
})

const token = () => app.jwt.sign({ id: 'u1', username: 'admin', role: 'admin' })

async function list(qs: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/api/audit${qs}`,
    headers: { authorization: `Bearer ${token()}` },
  })
  return { status: res.statusCode, body: JSON.parse(res.payload) }
}

function exportReq(qs: string) {
  return app.inject({
    method: 'GET',
    url: `/api/audit/export${qs}`,
    headers: { authorization: `Bearer ${token()}` },
  })
}

const ids = (body: { data: Array<{ targetId: string }> }) => body.data.map((e) => e.targetId)
/** The order with no `sort` at all — what every fallback must fall back TO. */
const DEFAULT_ORDER = ['r-bravo', 'r-charlie', 'r-alpha']

describe('GET /api/audit sort and dir', () => {
  it('orders newest first with no sort param', async () => {
    const { status, body } = await list('')
    expect(status).toBe(200)
    expect(ids(body)).toEqual(DEFAULT_ORDER)
  })

  it('reorders on a recognised key, and the whole page reflects it', async () => {
    const { status, body } = await list('?sort=action&dir=desc')
    expect(status).toBe(200)
    // action DESC: user.login, connection.delete, api_key.mint
    expect(ids(body)).toEqual(['r-alpha', 'r-charlie', 'r-bravo'])
    expect(ids(body)).not.toEqual(DEFAULT_ORDER)
  })

  it('reads any dir other than "desc" as ascending, including an omitted one', async () => {
    // action ASC: api_key.mint, connection.delete, user.login. That happens to
    // coincide with the default order for this fixture set, so the DESC case
    // above is what proves the sort is applied at all; this pins that only the
    // exact string `desc` flips it.
    const ASC = ['r-bravo', 'r-charlie', 'r-alpha']
    expect(ids((await list('?sort=action&dir=sideways')).body)).toEqual(ASC)
    expect(ids((await list('?sort=action&dir=DESC')).body)).toEqual(ASC)
    expect(ids((await list('?sort=action')).body)).toEqual(ASC)
  })

  // `sort` and `dir` are plain optional strings, not a `z.enum`: an enum would
  // answer 400 here, and a stale bookmark must render the table, not an error.
  it.each([
    ['an unknown key', '?sort=nonesuch&dir=asc'],
    ['an empty key', '?sort=&dir=desc'],
    ['the deprecated "col dir" string form', '?sort=created_at%20desc'],
    ['a prototype key', '?sort=__proto__'],
    ['a prototype method', '?sort=constructor'],
    ['a physical column name that is not a UI key', '?sort=target_id'],
  ])('answers 200 in the default order for %s', async (_label, qs) => {
    const { status, body } = await list(qs)
    expect(status).toBe(200)
    expect(ids(body)).toEqual(DEFAULT_ORDER)
  })

  // `user` maps to `user_id`, the physical column — the username is resolved
  // per page by `usernamesByIds` AFTER the slice, so it is not orderable in
  // SQL at all. The ORDER is asserted, not just the status: the previous
  // version of this test checked `status === 200` and `toHaveLength(3)`, which
  // is true of every possible ordering, so repointing the `user` key at any
  // other column left it green.
  it('sorts by the stored user_id, in the requested direction', async () => {
    // user_id ASC: usr-adam (r-charlie), usr-mike (r-alpha), usr-zoe (r-bravo)
    // — deliberately different from both the default order and the `action`
    // order, so a wrong column cannot produce this answer.
    const { status, body } = await list('?sort=user&dir=asc')
    expect(status).toBe(200)
    expect(ids(body)).toEqual(['r-charlie', 'r-alpha', 'r-bravo'])
    expect(ids((await list('?sort=user&dir=desc')).body)).toEqual([
      'r-bravo',
      'r-alpha',
      'r-charlie',
    ])
  })

  // Every param on this endpoint is a `RepeatableString`: Fastify hands a
  // repeated key through as an array, and a bare `z.string()` would 400 a
  // whole page over a browser back/forward resubmission or a stale bookmark.
  // Collapsing with `one()` is what keeps that from becoming a 500 instead —
  // `auditWhere` calls `.toLowerCase()` on the vertical needle.
  it.each([
    ['sort', '?sort=action&sort=nonesuch'],
    ['dir', '?dir=asc&dir=desc'],
    ['action', '?action=a&action=b'],
    ['user_id', '?user_id=a&user_id=b'],
    ['target_id', '?target_id=a&target_id=b'],
    ['from', '?from=1&from=2'],
    ['to', '?to=1&to=2'],
    ['page', '?page=1&page=2'],
    ['limit', '?limit=10&limit=20'],
  ])('does not 400 or 500 on a repeated %s', async (_label, qs) => {
    expect((await list(qs)).status).toBe(200)
  })

  it('does not 500 on a repeated vertical, which reaches .toLowerCase()', async () => {
    // The one repeated key that would throw rather than merely mis-filter.
    // Last value wins, so `crm` is the needle.
    const { status, body } = await list('?vertical=accounting&vertical=crm')
    expect(status).toBe(200)
    expect(ids(body)).toEqual(['r-bravo'])
  })

  it('renders the default order for a repeated sort whose last value is unknown', async () => {
    // Last-wins, then the allow-list: `nonesuch` is what arrives, so the
    // default order stands rather than `target`'s.
    //
    // `target`, NOT `action`, as the first value: `action` ASC coincides with
    // DEFAULT_ORDER for this fixture (see the comment on the `dir` test
    // above), so `?sort=action&sort=nonesuch` renders the same page under
    // last-wins and under first-wins and could not tell its own claim from
    // the negation of it. `target` ASC is a different order, so a first-wins
    // `one()` fails here.
    expect(ids((await list('?sort=target&sort=nonesuch')).body)).toEqual(DEFAULT_ORDER)
    // Anti-vacuity: the discarded value really would have produced something
    // else, so the assertion above is about last-wins and not about `target`
    // happening to be unorderable.
    expect(ids((await list('?sort=target')).body)).not.toEqual(DEFAULT_ORDER)
  })
})

describe('GET /api/audit?vertical=', () => {
  it('matches a substring case-insensitively', async () => {
    const { status, body } = await list('?vertical=crm')
    expect(status).toBe(200)
    expect(ids(body)).toEqual(['r-bravo'])
  })

  // The invariant that makes `auditWhere` a shared helper rather than three
  // copies: `meta.total` is computed by `countAudit`, so a filter applied only
  // in `listAudit` would leave the two disagreeing.
  it('counts the filtered set, not the whole log', async () => {
    const { body } = await list('?vertical=crm')
    expect(body.meta.total).toBe(1)
    expect(body.meta.total).toBe(body.data.length)
    const unfiltered = await list('')
    expect(unfiltered.body.meta.total).toBe(3)
  })

  it('combines with the other filters rather than replacing them', async () => {
    const { body } = await list('?vertical=accounting&action=user.login')
    expect(ids(body)).toEqual(['r-alpha'])
    expect(body.meta.total).toBe(1)
    expect((await list('?vertical=accounting&action=api_key.mint')).body.meta.total).toBe(0)
  })

  it('excludes rows with no vertical', async () => {
    // `lower(NULL) LIKE …` is NULL, so a row with no vertical matches no
    // needle — the em dash the cell renders is not searchable text.
    const { body } = await list('?vertical=c')
    expect(ids(body)).not.toContain('r-charlie')
  })

  it('narrows the export too, through the same helper', async () => {
    const res = await exportReq('?format=json&vertical=crm')
    expect(res.statusCode).toBe(200)
    const rows = JSON.parse(res.payload) as Array<{ targetId: string }>
    expect(rows.map((r) => r.targetId)).toEqual(['r-bravo'])
  })

  it('leaves the export in its own newest-first order, ignoring sort/dir', async () => {
    // ExportQuery extends ListQuery so it PARSES sort/dir; `iterateAudit`
    // deliberately does not apply them. An export that silently reordered
    // would break every downstream script that assumes newest-first.
    const res = await exportReq('?format=json&sort=action&dir=asc')
    expect(res.statusCode).toBe(200)
    const rows = JSON.parse(res.payload) as Array<{ targetId: string }>
    // The export writes its own `audit.export` row, which lands newest of all.
    expect(rows.map((r) => r.targetId).filter((t) => t?.startsWith('r-'))).toEqual(DEFAULT_ORDER)
  })
})

/**
 * `/api/audit/export` is a `RepeatableString` surface too, and it had none of
 * the list route's coverage.
 *
 * Both of these left the whole 629-test suite green, and the second is not
 * merely untested but a live 500: `auditWhere` calls `.toLowerCase()` on the
 * vertical needle, so an ARRAY there throws. That is the exact 400-to-500
 * downgrade `_query.ts`'s docblock declares `one()` mandatory to prevent,
 * unguarded on the one route that streams the whole log.
 */
describe('GET /api/audit/export with repeated query keys', () => {
  it('collapses a repeated format, last wins', async () => {
    // `csv` THEN `json`, never the reverse: the handler's own
    // `=== 'json' ? … : 'csv'` default answers `csv` when handed the raw
    // array, so asking for `csv` last would pass with `one()` deleted.
    const res = await exportReq('?format=csv&format=json')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')
    expect(JSON.parse(res.payload)).toBeInstanceOf(Array)
  })

  it('does not 500 on a repeated vertical, which reaches .toLowerCase()', async () => {
    const res = await exportReq('?format=json&vertical=accounting&vertical=crm')
    expect(res.statusCode).toBe(200)
    const rows = JSON.parse(res.payload) as Array<{ targetId: string }>
    // Last wins, so `crm` is the needle — not `accounting`, and not both.
    expect(rows.map((r) => r.targetId)).toEqual(['r-bravo'])
  })

  it('collapses a repeated filter on the CSV path too', async () => {
    // The default format, and the one an operator actually clicks. Filters
    // pass through `filterFromQuery` BEFORE the format branch on both hops,
    // so the two paths cannot diverge by construction — but nothing pinned
    // that, and "correct by construction" is how the export link itself was
    // wrong for a whole round.
    const res = await exportReq('?format=csv&action=user.login&action=api_key.mint')
    expect(res.statusCode).toBe(200)
    expect(res.payload).toContain('r-bravo')
    expect(res.payload).not.toContain('r-alpha')
  })

  it('does not 400 on any other repeated key', async () => {
    const res = await exportReq(
      '?format=json&action=a&action=b&user_id=a&user_id=b&target_id=a&target_id=b&from=1&from=2&to=9&to=8',
    )
    expect(res.statusCode).toBe(200)
  })
})
