/**
 * odoo-helpdesk over the shared Odoo client, against a JSON-2 / JSON-RPC fake
 * that honours only what Odoo documents.
 *
 * https://www.odoo.com/documentation/19.0/developer/reference/external_api.html
 *   "Post a JSON object at the /json/2/<model>/<method> URL."
 * https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html
 *   "offset and limit parameters are available to only retrieve a subset of all matched records."
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetOdooUidCache,
  readUpstreamPage,
  setDnsResolver,
  withPageSink,
} from '@opensteward/shared'
import { OdooHelpdeskAdapter } from '../../../../../../src/verticals/customer-support/adapters/odoo-helpdesk'
import { metadata } from '../../../../../../src/verticals/customer-support/adapters/odoo-helpdesk/metadata'
import { ADAPTER_FACTORIES } from '../../../../../../src/verticals/customer-support/adapter/factories'
import { PLATFORMS } from '../../../../../../src/verticals/customer-support/platforms/metadata'
import {
  ContactSchema,
  MessageSchema,
  TeamSchema,
  TicketSchema,
  UserSchema,
} from '../../../../../../src/verticals/customer-support/schema'

const KEY = 'odoo_key'
const BASE = 'https://acme.odoo.com'
const CREDS = { accessToken: KEY, extra: { baseUrl: BASE, database: 'acme', apiVersion: 'json2' } }
const RPC_CREDS = {
  accessToken: KEY,
  extra: { baseUrl: BASE, database: 'acme', login: 'bot@acme.com', apiVersion: 'rpc' },
}

type Row = Record<string, unknown> & { id: number }
interface Sent {
  path: string
  headers: Headers
  body: Record<string, unknown>
}

function idOf(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v
}

function matches(row: Row, domain: unknown[]): boolean {
  return domain.every((c) => {
    const [f, op, v] = c as [string, string, unknown]
    const have = f in row ? idOf(row[f]) : undefined
    if (have === undefined) throw new Error(`fake: row has no ${f}`)
    if (op === '=') return have === v
    if (op === 'in') return (v as unknown[]).includes(have)
    if (op === '>=') return String(have) >= String(v)
    throw new Error(`fake: unsupported operator ${op}`)
  })
}

/**
 * Fields each model has. helpdesk.* are the names Odoo's own demo data sets
 * (github.com/odoo/industry 19.0); the rest are Community models, the same
 * names in odoo/odoo 14.0 and 19.0 (see the transform tests). A Community
 * database has no helpdesk.* models at all (`community: true`).
 */
const MODEL_FIELDS: Record<string, string[]> = {
  'helpdesk.ticket': [
    'id',
    'name',
    'ticket_ref',
    'partner_id',
    'partner_name',
    'user_id',
    'team_id',
    'stage_id',
    'priority',
    'assign_date',
    'close_date',
    'create_date',
    'write_date',
  ],
  'helpdesk.team': ['id', 'name', 'active'],
  'mail.message': [
    'id',
    'body',
    'model',
    'res_id',
    'message_type',
    'subtype_id',
    'is_internal',
    'author_id',
    'attachment_ids',
    'date',
  ],
  'mail.message.subtype': ['id', 'internal'],
  'res.partner': ['id', 'name', 'email', 'phone', 'is_company', 'commercial_partner_id'],
  'res.users': ['id', 'name', 'email', 'share', 'active', 'partner_id'],
}

function fakeOdoo(stores: Record<string, Row[]>, opts: { community?: boolean } = {}) {
  const sent: Sent[] = []
  function handle(model: string, method: string, body: Record<string, unknown>) {
    const fields = opts.community && model.startsWith('helpdesk.') ? undefined : MODEL_FIELDS[model]
    if (!fields)
      return { status: 404, body: { name: 'werkzeug.exceptions.NotFound', message: model } }
    if (method === 'fields_get') {
      return { status: 200, body: Object.fromEntries(fields.map((f) => [f, { type: 'char' }])) }
    }
    const asked = (body['fields'] as string[] | undefined) ?? []
    const bad = asked.find((f) => !fields.includes(f))
    if (bad)
      return {
        status: 500,
        body: { name: 'builtins.ValueError', message: `Invalid field '${bad}'` },
      }
    const store = stores[model] ?? []
    const pick = (r: Row) =>
      Object.fromEntries([['id', r.id], ...asked.map((f) => [f, r[f] ?? false])])
    if (method === 'read') {
      const ids = body['ids'] as number[]
      return { status: 200, body: store.filter((r) => ids.includes(r.id)).map(pick) }
    }
    const hits = store.filter((r) => matches(r, (body['domain'] as unknown[]) ?? []))
    if (method === 'search_count') return { status: 200, body: hits.length }
    const ordered = body['order'] === 'id asc' ? [...hits].sort((a, b) => a.id - b.id) : hits
    const offset = (body['offset'] as number | undefined) ?? 0
    const limit = body['limit'] as number | undefined
    return {
      status: 200,
      body: ordered.slice(offset, limit === undefined ? undefined : offset + limit).map(pick),
    }
  }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    if (url.origin !== BASE || init?.method !== 'POST') return Response.json({}, { status: 404 })
    if (url.pathname === '/jsonrpc') {
      const id = body['id'] ?? null
      const { service, method, args } = body['params'] as {
        service: string
        method: string
        args: unknown[]
      }
      const ok = (result: unknown) => Response.json({ jsonrpc: '2.0', id, result })
      if (service === 'common' && method === 'authenticate') {
        return ok(args[0] === 'acme' && args[1] === 'bot@acme.com' && args[2] === KEY ? 7 : false)
      }
      const [, , , model, m, pos, kw] = args as [
        string,
        number,
        string,
        string,
        string,
        unknown[],
        Record<string, unknown>,
      ]
      if (m !== 'fields_get') sent.push({ path: `rpc:${model}/${m}`, headers, body: { pos, kw } })
      const named =
        m === 'read' ? { ids: pos[0], ...kw } : m === 'fields_get' ? kw : { domain: pos[0], ...kw }
      const r = handle(model, m, named)
      if (r.status !== 200) {
        const { name, message } = r.body as { name: string; message: string }
        return Response.json({
          jsonrpc: '2.0',
          id,
          error: { code: 200, message: 'Odoo Server Error', data: { name, message } },
        })
      }
      return ok(r.body)
    }
    const m = /^\/json\/2\/([^/]+)\/([^/]+)$/.exec(url.pathname)
    if (!m) return Response.json({}, { status: 404 })
    if (m[2] !== 'fields_get') sent.push({ path: url.pathname, headers, body })
    if (headers.get('authorization') !== `bearer ${KEY}`) {
      return Response.json(
        { name: 'werkzeug.exceptions.Unauthorized', message: 'Invalid apikey' },
        { status: 401 },
      )
    }
    const r = handle(m[1]!, m[2]!, body)
    return Response.json(r.body, { status: r.status })
  })
  return sent
}

const ticket = (id: number, extra: Partial<Row> = {}): Row => ({
  id,
  name: `Ticket ${id}`,
  ticket_ref: String(id).padStart(2, '0'),
  partner_id: [17, 'May J. Cooper'],
  partner_name: false,
  user_id: [2, 'Mitchell Admin'],
  team_id: [1, 'Customer Care'],
  stage_id: [1, 'New'],
  priority: '1',
  assign_date: false,
  close_date: false,
  create_date: '2026-01-01 00:00:00',
  write_date: '2026-01-02 00:00:00',
  ...extra,
})

const message = (id: number, extra: Partial<Row> = {}): Row => ({
  id,
  body: `<p>Message ${id}</p>`,
  model: 'helpdesk.ticket',
  res_id: 7,
  message_type: 'comment',
  subtype_id: [1, 'Discussions'],
  is_internal: false,
  author_id: [17, 'May J. Cooper'],
  attachment_ids: [],
  date: '2026-01-01 00:00:00',
  ...extra,
})

const SUBTYPES: Row[] = [
  { id: 1, internal: false },
  { id: 2, internal: true },
]

const USERS: Row[] = [
  {
    id: 2,
    name: 'Mitchell Admin',
    email: 'admin@acme.com',
    share: false,
    active: true,
    partner_id: [3, 'Mitchell Admin'],
  },
  {
    id: 8,
    name: 'Portal May',
    email: 'may@example.com',
    share: true,
    active: true,
    partner_id: [17, 'May J. Cooper'],
  },
]

beforeEach(() => {
  setDnsResolver(async () => [{ address: '93.184.216.34' }])
  _resetOdooUidCache()
})
afterEach(() => {
  vi.restoreAllMocks()
  setDnsResolver(undefined)
})

describe('odoo-helpdesk request shape', () => {
  it('posts helpdesk.ticket search_read to /json/2 with the bearer key and database', async () => {
    const sent = fakeOdoo({ 'helpdesk.ticket': [ticket(1)] })
    const rows = await new OdooHelpdeskAdapter().listTickets(CREDS, { page: 1, limit: 5 })
    rows.forEach((r) => TicketSchema.parse(r))
    expect(rows.map((r) => r.id)).toEqual(['1'])
    expect(sent[0]!.path).toBe('/json/2/helpdesk.ticket/search_read')
    expect(sent[0]!.headers.get('authorization')).toBe(`bearer ${KEY}`)
    expect(sent[0]!.headers.get('x-odoo-database')).toBe('acme')
    expect(sent[0]!.body).toMatchObject({ domain: [], offset: 0, limit: 5, order: 'id asc' })
  })

  it('getTicket reads the ticket by id', async () => {
    const sent = fakeOdoo({ 'helpdesk.ticket': [ticket(4, { close_date: '2026-01-05 00:00:00' })] })
    const t = TicketSchema.parse(await new OdooHelpdeskAdapter().getTicket(CREDS, '4'))
    expect(t.status).toBe('closed')
    expect(sent[0]!.path).toBe('/json/2/helpdesk.ticket/read')
    expect(sent[0]!.body['ids']).toEqual([4])
  })

  it('a missing ticket is a 404, and a non-integer id is a 404 before any call', async () => {
    const sent = fakeOdoo({ 'helpdesk.ticket': [] })
    const a = new OdooHelpdeskAdapter()
    await expect(a.getTicket(CREDS, '99')).rejects.toMatchObject({ statusCode: 404 })
    const before = sent.length
    await expect(a.getTicket(CREDS, 'abc')).rejects.toMatchObject({ statusCode: 404 })
    await expect(a.getTicket(CREDS, '0')).rejects.toMatchObject({ statusCode: 404 })
    expect(sent.length).toBe(before)
  })

  it('on a Community database (no helpdesk.ticket model) the call fails, never returns []', async () => {
    fakeOdoo({}, { community: true })
    await expect(
      new OdooHelpdeskAdapter().listTickets(CREDS, { page: 1, limit: 5 }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('lists teams from helpdesk.team and reads one', async () => {
    const sent = fakeOdoo({ 'helpdesk.team': [{ id: 1, name: 'Customer Care', active: true }] })
    const a = new OdooHelpdeskAdapter()
    const teams = await a.listTeams(CREDS, { page: 1, limit: 10 })
    teams.forEach((t) => TeamSchema.parse(t))
    expect(teams.map((t) => t.name)).toEqual(['Customer Care'])
    TeamSchema.parse(await a.getTeam(CREDS, '1'))
    expect(sent.map((s) => s.path)).toEqual([
      '/json/2/helpdesk.team/search_read',
      '/json/2/helpdesk.team/read',
    ])
  })

  it('lists contacts from res.partner', async () => {
    const sent = fakeOdoo({
      'res.partner': [
        {
          id: 17,
          name: 'May J. Cooper',
          email: 'may@example.com',
          phone: false,
          is_company: false,
          commercial_partner_id: [17, 'May J. Cooper'],
        },
      ],
    })
    const a = new OdooHelpdeskAdapter()
    const rows = await a.listContacts(CREDS, { page: 1, limit: 10 })
    rows.forEach((r) => ContactSchema.parse(r))
    expect(rows[0]).toMatchObject({ id: '17', email: 'may@example.com' })
    expect(rows[0]!.organizationId).toBeUndefined()
    ContactSchema.parse(await a.getContact(CREDS, '17'))
    expect(sent[0]!.path).toBe('/json/2/res.partner/search_read')
  })

  it('lists only internal users as agents, and getUser 404s a portal user', async () => {
    const sent = fakeOdoo({ 'res.users': USERS })
    const a = new OdooHelpdeskAdapter()
    const users = await a.listUsers(CREDS, { page: 1, limit: 10 })
    users.forEach((u) => UserSchema.parse(u))
    expect(users.map((u) => u.id)).toEqual(['2'])
    expect(sent[0]!.body['domain']).toEqual([['share', '=', false]])
    UserSchema.parse(await a.getUser(CREDS, '2'))
    await expect(a.getUser(CREDS, '8')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('odoo-helpdesk messages', () => {
  const stores = () => ({
    'helpdesk.ticket': [ticket(7), ticket(8)],
    'mail.message': [
      message(10, { message_type: 'email' }),
      message(11, { author_id: [3, 'Mitchell Admin'], subtype_id: [2, 'Note'] }),
      message(12, { message_type: 'notification', body: '<p>Stage changed</p>' }),
      message(13, { res_id: 8 }),
      message(14, { model: 'crm.lead' }),
      message(15, { author_id: false, attachment_ids: [1, 2, 3] }),
    ],
    'mail.message.subtype': SUBTYPES,
    'res.users': USERS,
  })

  it("reads the ticket's email and comment chatter, with visibility and authors", async () => {
    const sent = fakeOdoo(stores())
    const rows = await new OdooHelpdeskAdapter().listMessages(CREDS, '7', { page: 1, limit: 10 })
    rows.forEach((r) => MessageSchema.parse(r))
    expect(rows.map((r) => r.id)).toEqual(['10', '11', '15'])
    expect(rows.map((r) => [r.type, r.authorType, r.authorId])).toEqual([
      ['public', 'contact', '17'],
      ['internal', 'user', '2'],
      ['public', 'unknown', ''],
    ])
    expect(rows.every((r) => r.ticketId === '7')).toBe(true)
    expect(rows[2]!.attachmentCount).toBe(3)

    // A non-empty page proves the ticket exists: no separate ticket read.
    expect(sent.map((s) => s.path)).toEqual([
      '/json/2/mail.message/search_read',
      '/json/2/mail.message.subtype/read',
      '/json/2/res.users/search_read',
    ])
    expect(sent[0]!.body).toMatchObject({
      domain: [
        ['model', '=', 'helpdesk.ticket'],
        ['res_id', '=', 7],
        ['message_type', 'in', ['email', 'comment']],
      ],
      offset: 0,
      limit: 10,
      order: 'id asc',
    })
    expect(sent[1]!.body).toMatchObject({ ids: [1, 2], fields: ['id', 'internal'] })
    // A portal user's partner (17) stays a contact: only internal users are agents.
    expect(sent[2]!.body['domain']).toEqual([
      ['partner_id', 'in', [17, 3]],
      ['share', '=', false],
      ['active', 'in', [true, false]],
    ])
  })

  it('a missing ticket is a 404, not an empty thread', async () => {
    const sent = fakeOdoo(stores())
    await expect(
      new OdooHelpdeskAdapter().listMessages(CREDS, '99', { page: 1, limit: 10 }),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(sent.map((s) => s.path)).toEqual([
      '/json/2/mail.message/search_read',
      '/json/2/helpdesk.ticket/read',
    ])
  })

  it('an existing ticket with no messages is an empty thread', async () => {
    const sent = fakeOdoo({ ...stores(), 'mail.message': [] })
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await new OdooHelpdeskAdapter().listMessages(CREDS, '7', params)).toEqual([])
    expect(readUpstreamPage(params)).toEqual({ totalCount: 0, hasMore: false })
    expect(sent.map((s) => s.path)).toEqual([
      '/json/2/mail.message/search_read',
      '/json/2/helpdesk.ticket/read',
    ])
  })

  it('a non-integer ticket id is a 404 before any call', async () => {
    const sent = fakeOdoo(stores())
    await expect(
      new OdooHelpdeskAdapter().listMessages(CREDS, 'x', { page: 1, limit: 10 }),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(sent).toEqual([])
  })

  it('getMessage reads a ticket message and 404s other chatter', async () => {
    fakeOdoo(stores())
    const a = new OdooHelpdeskAdapter()
    const m = MessageSchema.parse(await a.getMessage(CREDS, '11'))
    expect(m).toMatchObject({ ticketId: '7', type: 'internal', authorType: 'user', authorId: '2' })
    await expect(a.getMessage(CREDS, '12')).rejects.toMatchObject({ statusCode: 404 })
    await expect(a.getMessage(CREDS, '14')).rejects.toMatchObject({ statusCode: 404 })
    await expect(a.getMessage(CREDS, '99')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('a page with no subtypes or authors makes no lookups', async () => {
    const sent = fakeOdoo({
      'helpdesk.ticket': [ticket(7)],
      'mail.message': [message(10, { subtype_id: false, author_id: false })],
    })
    const [m] = await new OdooHelpdeskAdapter().listMessages(CREDS, '7', { page: 1, limit: 10 })
    expect(m!.type).toBe('internal')
    expect(sent.map((s) => s.path)).toEqual(['/json/2/mail.message/search_read'])
  })
})

describe('odoo-helpdesk on Odoo 14–18 (RPC)', () => {
  it('talks /jsonrpc execute_kw for tickets, messages, contacts, users and teams', async () => {
    const sent = fakeOdoo({
      'helpdesk.ticket': [ticket(7)],
      'helpdesk.team': [{ id: 1, name: 'Customer Care', active: true }],
      'mail.message': [message(10), message(11, { author_id: [3, 'Mitchell Admin'] })],
      'mail.message.subtype': SUBTYPES,
      'res.users': USERS,
      'res.partner': [{ id: 17, name: 'May J. Cooper', email: false, phone: false }],
    })
    const a = new OdooHelpdeskAdapter()
    ;(await a.listTickets(RPC_CREDS, { page: 1, limit: 5 })).forEach((r) => TicketSchema.parse(r))
    TicketSchema.parse(await a.getTicket(RPC_CREDS, '7'))
    const msgs = await a.listMessages(RPC_CREDS, '7', { page: 1, limit: 5 })
    msgs.forEach((r) => MessageSchema.parse(r))
    expect(msgs.map((m) => m.authorType)).toEqual(['contact', 'user'])
    ;(await a.listContacts(RPC_CREDS, { page: 1, limit: 5 })).forEach((r) => ContactSchema.parse(r))
    ;(await a.listUsers(RPC_CREDS, { page: 1, limit: 5 })).forEach((r) => UserSchema.parse(r))
    ;(await a.listTeams(RPC_CREDS, { page: 1, limit: 5 })).forEach((r) => TeamSchema.parse(r))
    expect(sent.map((s) => s.path)).toEqual([
      'rpc:helpdesk.ticket/search_read',
      'rpc:helpdesk.ticket/read',
      'rpc:mail.message/search_read',
      'rpc:mail.message.subtype/read',
      'rpc:res.users/search_read',
      'rpc:res.partner/search_read',
      'rpc:res.users/search_read',
      'rpc:helpdesk.team/search_read',
    ])
    expect(sent[0]!.body).toMatchObject({
      pos: [[]],
      kw: { offset: 0, limit: 5, order: 'id asc' },
    })
  })

  it('an RPC connection without a login is a reconnect 401 before any call', async () => {
    const sent = fakeOdoo({ 'helpdesk.ticket': [ticket(1)] })
    await expect(
      new OdooHelpdeskAdapter().listTickets(
        { accessToken: KEY, extra: { baseUrl: BASE, database: 'acme', apiVersion: 'rpc' } },
        { page: 1, limit: 5 },
      ),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' })
    expect(sent).toEqual([])
  })
})

describe('odoo-helpdesk paging and limits', () => {
  it('walks tickets by offset/limit in id order and reports the total', async () => {
    fakeOdoo({ 'helpdesk.ticket': [3, 1, 5, 2, 4].map((id) => ticket(id)) })
    const a = new OdooHelpdeskAdapter()
    const seen: string[] = []
    const metas: unknown[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 2 })
      seen.push(...(await a.listTickets(CREDS, params)).map((r) => r.id))
      metas.push(readUpstreamPage(params))
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5'])
    expect(metas).toEqual([
      { totalCount: 5, hasMore: true },
      { totalCount: 5, hasMore: true },
      { totalCount: 5, hasMore: false },
    ])
  })

  it("walks a ticket's messages by offset/limit", async () => {
    const sent = fakeOdoo({
      'helpdesk.ticket': [ticket(7)],
      'mail.message': [23, 21, 22].map((id) => message(id)),
      'mail.message.subtype': SUBTYPES,
      'res.users': USERS,
    })
    const a = new OdooHelpdeskAdapter()
    const p1 = withPageSink({ page: 1, limit: 2 })
    const p2 = withPageSink({ page: 2, limit: 2 })
    const first = await a.listMessages(CREDS, '7', p1)
    const second = await a.listMessages(CREDS, '7', p2)
    expect([...first, ...second].map((m) => m.id)).toEqual(['21', '22', '23'])
    expect(readUpstreamPage(p1)).toEqual({ totalCount: 3, hasMore: true })
    expect(readUpstreamPage(p2)).toEqual({ totalCount: 3, hasMore: false })
    const pages = sent.filter((s) => s.path === '/json/2/mail.message/search_read')
    expect(pages.map((s) => [s.body['offset'], s.body['limit']])).toEqual([
      [0, 2],
      [2, 2],
    ])
  })

  it('updated_after is write_date >= in Odoo UTC format, inclusive, on the page and the count', async () => {
    const sent = fakeOdoo({
      'helpdesk.ticket': [
        ticket(1, { write_date: '2026-03-01 09:59:59' }),
        ticket(2, { write_date: '2026-03-01 10:00:00' }),
        ticket(3, { write_date: '2026-03-02 00:00:00' }),
        ticket(4, { write_date: '2026-03-03 00:00:00' }),
      ],
    })
    // 11:00 at +01:00 is 10:00 UTC: the watermark is sent in UTC.
    const updatedAfter = new Date('2026-03-01T11:00:00+01:00')
    const params = withPageSink({ page: 1, limit: 2, updatedAfter })
    const rows = await new OdooHelpdeskAdapter().listTickets(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['2', '3'])
    expect(readUpstreamPage(params)).toEqual({ totalCount: 3, hasMore: true })
    const clause = ['write_date', '>=', '2026-03-01 10:00:00']
    expect(sent[0]!.body['domain']).toEqual([clause])
    expect(sent[1]!.path).toBe('/json/2/helpdesk.ticket/search_count')
    expect(sent[1]!.body['domain']).toEqual([clause])
  })

  it('updated_after is added after the resource domain on scoped lists', async () => {
    const sent = fakeOdoo({
      'res.users': USERS.map((u) => ({ ...u, write_date: '2026-03-02 00:00:00' })),
    })
    await new OdooHelpdeskAdapter().listUsers(CREDS, {
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-03-01T00:00:00Z'),
    })
    expect(sent[0]!.body['domain']).toEqual([
      ['share', '=', false],
      ['write_date', '>=', '2026-03-01 00:00:00'],
    ])
  })

  it('a fractional limit is floored before it is sent', async () => {
    const sent = fakeOdoo({ 'helpdesk.ticket': [ticket(1), ticket(2), ticket(3)] })
    await new OdooHelpdeskAdapter().listTickets(CREDS, { page: 1, limit: 2.7 })
    expect(sent[0]!.body['limit']).toBe(2)
  })

  it('a limit below 1 is a 400 VALIDATION before any call', async () => {
    const sent = fakeOdoo({ 'helpdesk.ticket': [ticket(1)] })
    await expect(
      new OdooHelpdeskAdapter().listTickets(CREDS, { page: 1, limit: 0 }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' })
    expect(sent).toEqual([])
  })
})

describe('odoo-helpdesk refusals and registration', () => {
  it.each(['listTags', 'getTag', 'listMacros', 'getMacro'] as const)(
    '%s is a 501 with no call made',
    async (method) => {
      const sent = fakeOdoo({})
      const a = new OdooHelpdeskAdapter()
      await expect(
        (a[method] as (c: unknown, p: unknown) => Promise<unknown>)(
          CREDS,
          method.startsWith('get') ? '1' : { page: 1 },
        ),
      ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(sent).toEqual([])
    },
  )

  it('ships no webhook verifier (Odoo documents no webhook signature)', () => {
    const a = new OdooHelpdeskAdapter() as unknown as Record<string, unknown>
    expect(a['verifyWebhook']).toBeUndefined()
    expect(a['parseWebhookEvents']).toBeUndefined()
  })

  it('uses the shared Odoo credential form, not OAuth', async () => {
    const a = new OdooHelpdeskAdapter()
    expect(a.credentialFields().map((f) => f.name)).toEqual([
      'baseUrl',
      'apiVersion',
      'database',
      'login',
      'apiKey',
    ])
    await expect(a.exchangeCode('code', 'https://x')).rejects.toThrow(/not supported/)
  })

  it('metadata declares the five mapped resources and the two refused', () => {
    expect([...metadata.availableResources].sort()).toEqual([
      'contact',
      'message',
      'team',
      'ticket',
      'user',
    ])
    expect(metadata.unavailableResources.map((r) => r.resource).sort()).toEqual(['macro', 'tag'])
  })

  it('is registered, as an api_key platform that names the Enterprise and Custom-plan limits', () => {
    expect(ADAPTER_FACTORIES['odoo-helpdesk']!({})).toBeInstanceOf(OdooHelpdeskAdapter)
    const p = PLATFORMS.find((x) => x.slug === 'odoo-helpdesk')!
    expect(p.auth_type).toBe('api_key')
    expect(p.description).toMatch(/Enterprise only/)
    expect(p.description).toMatch(/Custom plan/)
  })
})
