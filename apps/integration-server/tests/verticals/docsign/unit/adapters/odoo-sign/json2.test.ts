/**
 * odoo-sign over the shared Odoo client, against a JSON-2 / JSON-RPC fake that
 * honours only what Odoo documents.
 *
 * https://www.odoo.com/documentation/19.0/developer/reference/external_api.html
 *   "Post a JSON object at the /json/2/<model>/<method> URL."
 * https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html
 *   "offset and limit parameters are available to only retrieve a subset of all matched records."
 *
 * The JSON-2 fake is Odoo 19.0's Sign layout (sign.document between template
 * and attachment, sign.item.document_id); the RPC fake is 18.0's
 * (sign.template.attachment_id, sign.item.template_id, no sign.document) —
 * both as github.com/odoo/industry's data writes them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetOdooUidCache,
  readUpstreamPage,
  setDnsResolver,
  withPageSink,
} from '@opensteward/shared'
import { OdooSignAdapter } from '../../../../../../src/verticals/docsign/adapters/odoo-sign'
import { metadata } from '../../../../../../src/verticals/docsign/adapters/odoo-sign/metadata'
import { ADAPTER_FACTORIES } from '../../../../../../src/verticals/docsign/adapter/factories'
import { PLATFORMS } from '../../../../../../src/verticals/docsign/platforms/metadata'
import {
  DocumentSchema,
  EnvelopeSchema,
  SignerSchema,
  TemplateSchema,
} from '../../../../../../src/verticals/docsign/schema'

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
  body: Record<string, unknown>
  headers: Headers
}

const AUTO = ['id', 'display_name', 'create_uid', 'create_date', 'write_uid', 'write_date']

/** Odoo 19.0 (JSON-2). */
const FIELDS_19: Record<string, string[]> = {
  'sign.request': [
    ...AUTO,
    'subject',
    'reference',
    'state',
    'template_id',
    'request_item_ids',
    'validity',
    'last_reminder',
  ],
  'sign.request.item': [...AUTO, 'partner_id', 'role_id', 'state', 'signer_email', 'signing_date'],
  'sign.template': [...AUTO, 'name', 'user_id', 'tag_ids'],
  'sign.document': [...AUTO, 'template_id', 'attachment_id'],
  'sign.item': [...AUTO, 'document_id', 'responsible_id', 'type_id', 'name'],
  'ir.attachment': [...AUTO, 'name', 'mimetype', 'file_size', 'datas'],
}

/** Odoo 18.0 (RPC): no sign.document; the template holds its file; items point at the template. */
const FIELDS_18: Record<string, string[]> = {
  ...FIELDS_19,
  'sign.template': [...AUTO, 'name', 'user_id', 'tag_ids', 'attachment_id'],
  'sign.item': [...AUTO, 'template_id', 'responsible_id', 'type_id', 'name'],
}
delete FIELDS_18['sign.document']

function idOf(v: unknown): unknown {
  return Array.isArray(v) && typeof v[1] === 'string' ? v[0] : v
}

function matches(row: Row, domain: unknown[]): boolean {
  return domain.every((c) => {
    const [f, op, v] = c as [string, string, unknown]
    if (!(f in row)) throw new Error(`fake: row has no ${f}`)
    const have = idOf(row[f])
    if (op === '=') return have === v
    // Odoo datetimes are "YYYY-MM-DD HH:MM:SS" UTC strings, so they order as text.
    if (op === '>=') return typeof have === 'string' && have >= (v as string)
    if (op === 'in') {
      const want = v as unknown[]
      // An x2many matches when any of its ids is in the value.
      return Array.isArray(have) ? have.some((x) => want.includes(x)) : want.includes(have)
    }
    throw new Error(`fake: unsupported operator ${op}`)
  })
}

function fakeOdoo(stores: Record<string, Row[]>) {
  const sent: Sent[] = []
  function handle(model: string, method: string, body: Record<string, unknown>, rpc: boolean) {
    const fields = (rpc ? FIELDS_18 : FIELDS_19)[model]
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
    if (method !== 'search_read')
      return { status: 404, body: { name: 'NotFound', message: method } }
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
      const r = handle(model, m, named, true)
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
    const r = handle(m[1]!, m[2]!, body, false)
    return Response.json(r.body, { status: r.status })
  })
  return sent
}

const request = (id: number, template: number, items: number[], state = 'signed'): Row => ({
  id,
  display_name: `Request ${id}`,
  subject: `Signature Request ${id}`,
  reference: `Doc ${id}.pdf`,
  state,
  template_id: [template, `Template ${template}`],
  request_item_ids: items,
  validity: false,
  last_reminder: false,
  create_uid: [2, 'Mitchell Admin'],
  create_date: '2026-01-01 00:00:00',
  write_date: '2026-01-02 00:00:00',
})

const item = (id: number, state = 'completed'): Row => ({
  id,
  display_name: `Signer ${id}`,
  partner_id: [100 + id, `Partner ${id}`],
  role_id: [5, 'Customer'],
  state,
  signer_email: `signer${id}@example.com`,
  signing_date: '2026-01-02 00:00:00',
})

const template = (id: number, attachment?: number): Row => ({
  id,
  display_name: `Template ${id}`,
  name: `Template ${id}`,
  user_id: [2, 'Mitchell Admin'],
  tag_ids: [],
  ...(attachment ? { attachment_id: [attachment, `file-${attachment}.pdf`] } : {}),
  create_date: '2026-01-01 00:00:00',
  write_date: '2026-01-02 00:00:00',
})

const attachment = (id: number): Row => ({
  id,
  name: `file-${id}.pdf`,
  mimetype: 'application/pdf',
  file_size: 1000 + id,
  datas: 'SECRET-CONTENT',
})

/** Odoo 19.0 store: template 6 has two sign.documents, items on both. */
function store19(): Record<string, Row[]> {
  return {
    'sign.request': [request(5, 6, [12, 11]), request(7, 6, [13], 'sent')],
    'sign.request.item': [item(11), item(12), item(13, 'sent')],
    'sign.template': [template(6), template(8)],
    'sign.document': [
      { id: 62, template_id: [6, 'Template 6'], attachment_id: [1914, 'file-1914.pdf'] },
      { id: 61, template_id: [6, 'Template 6'], attachment_id: [1913, 'file-1913.pdf'] },
    ],
    'sign.item': [
      { id: 101, document_id: [61, 'D61'], responsible_id: [5, 'Museum'] },
      { id: 102, document_id: [61, 'D61'], responsible_id: [6, 'Artist'] },
      { id: 103, document_id: [62, 'D62'], responsible_id: [5, 'Museum'] },
    ],
    'ir.attachment': [attachment(1913), attachment(1914)],
  }
}

/** Odoo 18.0 store: the template carries its one attachment; items point at the template. */
function store18(): Record<string, Row[]> {
  return {
    'sign.request': [request(5, 6, [11])],
    'sign.request.item': [item(11)],
    'sign.template': [template(6, 1913)],
    'sign.item': [
      { id: 101, template_id: [6, 'Template 6'], responsible_id: [5, 'Museum'] },
      { id: 102, template_id: [6, 'Template 6'], responsible_id: [5, 'Museum'] },
    ],
    'ir.attachment': [attachment(1913)],
  }
}

beforeEach(() => {
  setDnsResolver(async () => [{ address: '93.184.216.34' }])
  _resetOdooUidCache()
})
afterEach(() => {
  vi.restoreAllMocks()
  setDnsResolver(undefined)
})

describe('odoo-sign on Odoo 19+ (JSON-2)', () => {
  it('posts sign.request search_read to /json/2 with the bearer key and database', async () => {
    const sent = fakeOdoo(store19())
    const rows = await new OdooSignAdapter().listEnvelopes(CREDS, { page: 1, limit: 5 })
    rows.forEach((r) => EnvelopeSchema.parse(r))
    expect(sent[0]!.path).toBe('/json/2/sign.request/search_read')
    expect(sent[0]!.headers.get('authorization')).toBe(`bearer ${KEY}`)
    expect(sent[0]!.headers.get('x-odoo-database')).toBe('acme')
    expect(sent[0]!.body).toMatchObject({ domain: [], offset: 0, limit: 5, order: 'id asc' })
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ['5', 'completed'],
      ['7', 'sent'],
    ])
    // The template's sign.documents, in id order, as <envelope>:<document> ids.
    expect(rows[0]!.documentIds).toEqual(['5:61', '5:62'])
    expect(rows[1]!.documentIds).toEqual(['7:61', '7:62'])
    expect(rows[0]!.signerIds).toEqual(['11', '12'])
    const docs = sent.find((s) => s.path === '/json/2/sign.document/search_read')
    expect(docs!.body['domain']).toEqual([['template_id', 'in', [6]]])
  })

  it('getEnvelope reads one sign.request', async () => {
    const sent = fakeOdoo(store19())
    const e = EnvelopeSchema.parse(await new OdooSignAdapter().getEnvelope(CREDS, '5'))
    expect(e).toMatchObject({ id: '5', templateId: '6', senderName: 'Mitchell Admin' })
    expect(sent[0]!.path).toBe('/json/2/sign.request/read')
  })

  it("lists an envelope's signers from its request_item_ids", async () => {
    const sent = fakeOdoo(store19())
    const rows = await new OdooSignAdapter().listSigners(CREDS, '5', { page: 1, limit: 10 })
    rows.forEach((r) => SignerSchema.parse(r))
    expect(rows.map((r) => [r.id, r.envelopeId, r.status])).toEqual([
      ['11', '5', 'signed'],
      ['12', '5', 'signed'],
    ])
    expect(sent.map((s) => s.path)).toEqual([
      '/json/2/sign.request/read',
      '/json/2/sign.request.item/read',
    ])
    expect(sent[1]!.body['ids']).toEqual([11, 12])
  })

  it('getSigner finds its envelope through request_item_ids', async () => {
    const sent = fakeOdoo(store19())
    const s = SignerSchema.parse(await new OdooSignAdapter().getSigner(CREDS, '13'))
    expect(s).toMatchObject({ id: '13', envelopeId: '7', status: 'sent' })
    const lookup = sent.find((x) => x.path === '/json/2/sign.request/search_read')
    expect(lookup!.body['domain']).toEqual([['request_item_ids', 'in', [13]]])
  })

  it('lists documents from sign.document and ir.attachment metadata, never the content', async () => {
    const sent = fakeOdoo(store19())
    const rows = await new OdooSignAdapter().listDocuments(CREDS, '5', { page: 1, limit: 10 })
    rows.forEach((r) => DocumentSchema.parse(r))
    expect(rows.map((d) => [d.id, d.name, d.sizeBytes, d.order])).toEqual([
      ['5:61', 'file-1913.pdf', 2913, 0],
      ['5:62', 'file-1914.pdf', 2914, 1],
    ])
    const att = sent.find((s) => s.path === '/json/2/ir.attachment/read')
    expect(att!.body['fields']).not.toContain('datas')
    expect(JSON.stringify(rows)).not.toContain('SECRET-CONTENT')
  })

  it('getDocument takes <envelopeId>:<document id>', async () => {
    fakeOdoo(store19())
    const a = new OdooSignAdapter()
    const d = DocumentSchema.parse(await a.getDocument(CREDS, '5:62'))
    expect(d).toMatchObject({ id: '5:62', externalId: '62', order: 1 })
    await expect(a.getDocument(CREDS, '5:99')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('lists templates with sign.item roles and sign.document counts', async () => {
    const sent = fakeOdoo(store19())
    const rows = await new OdooSignAdapter().listTemplates(CREDS, { page: 1, limit: 10 })
    rows.forEach((r) => TemplateSchema.parse(r))
    expect(rows.map((t) => [t.id, t.documentCount, t.signerRoles])).toEqual([
      ['6', 2, ['Museum', 'Artist']],
      ['8', 0, []],
    ])
    const items = sent.find((s) => s.path === '/json/2/sign.item/search_read')
    expect(items!.body['domain']).toEqual([['document_id', 'in', [61, 62]]])
  })
})

describe('odoo-sign on Odoo 14–18 (RPC, 18.0 layout)', () => {
  it('talks /jsonrpc execute_kw and reads the template attachment instead of sign.document', async () => {
    const sent = fakeOdoo(store18())
    const a = new OdooSignAdapter()
    const envelopes = await a.listEnvelopes(RPC_CREDS, { page: 1, limit: 10 })
    envelopes.forEach((r) => EnvelopeSchema.parse(r))
    expect(sent[0]!.path).toBe('rpc:sign.request/search_read')
    expect(envelopes[0]!.documentIds).toEqual(['5:1913'])
    expect(sent.map((s) => s.path)).not.toContain('rpc:sign.document/search_read')

    const docs = await a.listDocuments(RPC_CREDS, '5', { page: 1, limit: 10 })
    docs.forEach((r) => DocumentSchema.parse(r))
    expect(docs.map((d) => [d.id, d.name, d.metadata['model']])).toEqual([
      ['5:1913', 'file-1913.pdf', 'ir.attachment'],
    ])

    const templates = await a.listTemplates(RPC_CREDS, { page: 1, limit: 10 })
    templates.forEach((r) => TemplateSchema.parse(r))
    expect(templates.map((t) => [t.documentCount, t.signerRoles])).toEqual([[1, ['Museum']]])
    const items = sent.find((s) => s.path === 'rpc:sign.item/search_read')
    expect(items!.body['pos']).toEqual([[['template_id', 'in', [6]]]])

    const signers = await a.listSigners(RPC_CREDS, '5', { page: 1, limit: 10 })
    signers.forEach((r) => SignerSchema.parse(r))
    expect(signers.map((s) => s.id)).toEqual(['11'])
  })
})

describe('odoo-sign paging', () => {
  it('walks envelopes by offset/limit in id order and reports the total', async () => {
    const s = store19()
    s['sign.request'] = [3, 1, 5, 2, 4].map((id) => request(id, 6, []))
    fakeOdoo(s)
    const a = new OdooSignAdapter()
    const seen: string[] = []
    const metas: unknown[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 2 })
      seen.push(...(await a.listEnvelopes(CREDS, params)).map((r) => r.id))
      metas.push(readUpstreamPage(params))
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5'])
    expect(metas).toEqual([
      { totalCount: 5, hasMore: true },
      { totalCount: 5, hasMore: true },
      { totalCount: 5, hasMore: false },
    ])
  })

  it('updated_after is a write_date >= criterion in UTC, on envelopes and templates', async () => {
    const s = store19()
    s['sign.request'] = [
      { ...request(1, 6, []), write_date: '2026-03-01 09:59:59' },
      { ...request(2, 6, []), write_date: '2026-03-01 10:00:00' },
      { ...request(3, 6, []), write_date: '2026-03-02 00:00:00' },
    ]
    s['sign.template'] = [
      { ...template(6), write_date: '2026-02-01 00:00:00' },
      { ...template(8), write_date: '2026-03-05 00:00:00' },
    ]
    const sent = fakeOdoo(s)
    const a = new OdooSignAdapter()
    // 11:00 at +01:00 is 10:00 UTC.
    const updatedAfter = new Date('2026-03-01T11:00:00+01:00')
    const params = withPageSink({ page: 1, limit: 10, updatedAfter })
    const rows = await a.listEnvelopes(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['2', '3'])
    expect(sent[0]!.body['domain']).toEqual([['write_date', '>=', '2026-03-01 10:00:00']])
    expect(readUpstreamPage(params)).toEqual({ totalCount: 2, hasMore: false })

    sent.length = 0
    const templates = await a.listTemplates(CREDS, { page: 1, limit: 10, updatedAfter })
    expect(templates.map((t) => t.id)).toEqual(['8'])
    expect(sent[0]!.body['domain']).toEqual([['write_date', '>=', '2026-03-01 10:00:00']])
  })

  it('without updated_after the domain is empty', async () => {
    const sent = fakeOdoo(store19())
    await new OdooSignAdapter().listTemplates(CREDS, { page: 1, limit: 10 })
    expect(sent[0]!.body['domain']).toEqual([])
  })

  it('pages templates by offset/limit', async () => {
    const sent = fakeOdoo(store19())
    const params = withPageSink({ page: 2, limit: 1 })
    const rows = await new OdooSignAdapter().listTemplates(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['8'])
    expect(sent[0]!.body).toMatchObject({ offset: 1, limit: 1, order: 'id asc' })
    expect(readUpstreamPage(params)).toEqual({ totalCount: 2, hasMore: false })
  })

  it("pages an envelope's signers locally, reading only the page's items", async () => {
    const s = store19()
    s['sign.request'] = [request(5, 6, [15, 11, 13, 12, 14])]
    s['sign.request.item'] = [11, 12, 13, 14, 15].map((id) => item(id))
    const sent = fakeOdoo(s)
    const a = new OdooSignAdapter()
    const params = withPageSink({ page: 2, limit: 2 })
    const rows = await a.listSigners(CREDS, '5', params)
    expect(rows.map((r) => r.id)).toEqual(['13', '14'])
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 5, hasMore: true })
    const read = sent.find((x) => x.path === '/json/2/sign.request.item/read')
    expect(read!.body['ids']).toEqual([13, 14])
  })

  it("pages an envelope's documents locally and keeps each file's position", async () => {
    fakeOdoo(store19())
    const params = withPageSink({ page: 2, limit: 1 })
    const rows = await new OdooSignAdapter().listDocuments(CREDS, '5', params)
    expect(rows.map((r) => [r.id, r.order])).toEqual([['5:62', 1]])
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 2, hasMore: false })
  })

  it('a fractional limit is floored; a limit below 1 is a 400 before any call', async () => {
    const sent = fakeOdoo(store19())
    const a = new OdooSignAdapter()
    await a.listEnvelopes(CREDS, { page: 1, limit: 2.7 })
    expect(sent[0]!.body['limit']).toBe(2)
    sent.length = 0
    await expect(a.listEnvelopes(CREDS, { page: 1, limit: 0 })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION',
    })
    expect(sent).toEqual([])
  })
})

describe('odoo-sign ids', () => {
  it.each(['abc', '0', '1.5', '99999999999999999999'])(
    "id '%s' names no Odoo record: 404 before any call",
    async (id) => {
      const sent = fakeOdoo(store19())
      await expect(new OdooSignAdapter().getEnvelope(CREDS, id)).rejects.toMatchObject({
        statusCode: 404,
      })
      expect(sent).toEqual([])
    },
  )

  it('a document id without an envelope part is a 404 before any call', async () => {
    const sent = fakeOdoo(store19())
    await expect(new OdooSignAdapter().getDocument(CREDS, '61')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(sent).toEqual([])
  })

  it('a missing envelope, signer or template is a 404', async () => {
    fakeOdoo(store19())
    const a = new OdooSignAdapter()
    await expect(a.getEnvelope(CREDS, '99')).rejects.toMatchObject({ statusCode: 404 })
    await expect(a.getSigner(CREDS, '99')).rejects.toMatchObject({ statusCode: 404 })
    await expect(a.getTemplate(CREDS, '99')).rejects.toMatchObject({ statusCode: 404 })
    await expect(a.listSigners(CREDS, '99', { page: 1 })).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('a connection without the shared Odoo form fields is a 401 reconnect', async () => {
    const sent = fakeOdoo(store19())
    await expect(
      new OdooSignAdapter().listEnvelopes({ accessToken: KEY }, { page: 1 }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(sent).toEqual([])
  })
})

describe('odoo-sign refusals', () => {
  it.each(['listAuditTrailEntries', 'getAuditTrailEntry', 'voidEnvelope'] as const)(
    '%s is a 501 with no call made',
    async (method) => {
      const sent = fakeOdoo(store19())
      const a = new OdooSignAdapter()
      const call = a[method] as (...args: unknown[]) => Promise<unknown>
      await expect(call.call(a, CREDS, '5', { page: 1 })).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
      })
      expect(sent).toEqual([])
    },
  )

  it('metadata declares the four mapped resources and the audit trail refused', () => {
    expect([...metadata.availableResources].sort()).toEqual([
      'document',
      'envelope',
      'signer',
      'template',
    ])
    expect(metadata.unavailableResources.map((r) => r.resource)).toEqual(['audit-trail-entry'])
  })

  it('is registered, and its platform entry says Enterprise and Custom plan', () => {
    expect(ADAPTER_FACTORIES['odoo-sign']).toBeDefined()
    const p = PLATFORMS.find((x) => x.slug === 'odoo-sign')!
    expect(p.auth_type).toBe('api_key')
    expect(p.description).toMatch(/Enterprise/)
    expect(p.description).toMatch(/Custom plan/)
  })

  it('uses the shared Odoo credential form', () => {
    expect(new OdooSignAdapter().credentialFields().map((f) => f.name)).toEqual([
      'baseUrl',
      'apiVersion',
      'database',
      'login',
      'apiKey',
    ])
  })
})
