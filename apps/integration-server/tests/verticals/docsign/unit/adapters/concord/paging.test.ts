/**
 * Concord list paging and request shape.
 *
 * Every fake answers at the axios layer and honours ONLY what
 * https://api.doc.concordnow.com/concord-openapi-bundled.yaml documents; an
 * undocumented path or query parameter throws.
 *
 *   - ListAgreements, GET /user/me/organizations/{organizationId}/agreements:
 *     required `statuses` (ContractLibraryStatusEnum, form/explode), `page`
 *     ("The page to display.", 0-based: AgreementListDto.page "Current page
 *     number" example 0), `numberOfItemsByPage`, `isInboxed`. Reply
 *     AgreementListDto { items, numberOfItems, numberOfItemsByPage, page, total, totalInvitations }.
 *   - GetAgreement, GET /organizations/{organizationId}/agreements/{agreementUid}.
 *   - SignatureGet, GET .../signature: SignatureMetadataGet { enforceOrder, slots }
 *     (no required properties).
 *   - List the attachments, GET .../attachments: { attachments }.
 *   - GetActivities, GET .../activities with required `type` AUDIT|CHAT: { activities }.
 *   - Auth: the X-API-KEY header.
 */
import axios, { type AxiosRequestConfig } from 'axios'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { ConcordAdapter } from '../../../../../../src/verticals/docsign/adapters/concord'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { AuditTrailEntrySchema } from '../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { TemplateSchema } from '../../../../../../src/verticals/docsign/schema/template'
import {
  AGREEMENT_LIST_ITEM_EXAMPLE,
  ATTACHMENT_EXAMPLE,
  AUDIT_ACTIVITY_EXAMPLE,
  GET_AGREEMENT_EXAMPLE,
  GROUP_SLOT_EXAMPLE,
  OPEN_SLOT_EXAMPLE,
  SIGNED_SLOT_EXAMPLE,
} from './transform/fixtures'

const CREDS: Credentials = { accessToken: 'key-1', extra: { organizationId: '42' } }
const L = 2
const N = 2 * L + 1
const CALL_BUDGET = 50

const adapter = new ConcordAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

interface Sent {
  url: string
  params: Record<string, unknown> | undefined
  headers: Record<string, unknown>
  baseURL: string | undefined
  query: string
}

type Handler = (url: string, params: Record<string, unknown> | undefined) => unknown

function fakeAxios(handler: Handler) {
  const sent: Sent[] = []
  let calls = 0
  const spy = vi.spyOn(axios.Axios.prototype, 'request').mockImplementation(async function (
    this: { defaults: AxiosRequestConfig },
    config,
  ) {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    const cfg = config as AxiosRequestConfig
    const url = String(cfg.url)
    const params = cfg.params as Record<string, unknown> | undefined
    const serializer = this.defaults.paramsSerializer as { indexes?: null } | undefined
    const query = axios.getUri({ url: '/', params, paramsSerializer: serializer })
    sent.push({
      url,
      params,
      headers: { ...(this.defaults.headers as unknown as Record<string, unknown>) },
      baseURL: this.defaults.baseURL,
      query,
    })
    return { data: handler(url, params), status: 200, headers: {}, config: cfg } as never
  })
  return { sent, spy }
}

function only(params: Record<string, unknown> | undefined, allowed: string[]): void {
  for (const k of Object.keys(params ?? {})) {
    if (!allowed.includes(k)) throw new Error(`undocumented parameter ${k}`)
  }
}

const AGREEMENTS_PATH = '/user/me/organizations/42/agreements'
const LIST_PARAMS = ['statuses', 'page', 'numberOfItemsByPage', 'isInboxed']
const PER_AGREEMENT = /^\/organizations\/42\/agreements\/([^/]+)\/(signature|attachments)$/

/**
 * SignatureGet for agreement `agr-<n>`: enforceOrder is true for odd n, and
 * one group slot whose id is 1000+n. List the attachments: n attachments.
 */
function perAgreement(url: string, params: Record<string, unknown> | undefined): unknown {
  const m = PER_AGREEMENT.exec(url)
  if (!m) throw new Error(`unexpected path ${url}`)
  only(params, [])
  const n = Number(m[1]!.replace('agr-', ''))
  if (m[2] === 'signature') {
    return {
      enforceOrder: n % 2 === 1,
      autoRequest: false,
      signatureProvider: 'CONCORD',
      slots: [{ ...GROUP_SLOT_EXAMPLE, id: 1000 + n }],
    }
  }
  return {
    attachments: Array.from({ length: n }, (_, i) => ({ ...ATTACHMENT_EXAMPLE, id: `att-${i}` })),
  }
}

/** ListAgreements over `total` agreements in `status`, honouring 0-based `page`. */
function fakeAgreements(total: number, status: string, invitations = 0) {
  const all = Array.from({ length: total }, (_, i) => ({
    ...AGREEMENT_LIST_ITEM_EXAMPLE,
    uuid: `agr-${i + 1}`,
    status,
  }))
  return fakeAxios((url, params) => {
    if (url !== AGREEMENTS_PATH) return perAgreement(url, params)
    only(params, LIST_PARAMS)
    const statuses = params?.['statuses']
    if (!Array.isArray(statuses) || statuses.length === 0) throw new Error('statuses is required')
    const matching = all.filter((a) => statuses.includes(a.status))
    const page = Number(params?.['page'] ?? 0)
    const size = Number(params?.['numberOfItemsByPage'] ?? 25)
    const items = matching.slice(page * size, page * size + size)
    return {
      items,
      numberOfItems: items.length,
      numberOfItemsByPage: size,
      page,
      total: matching.length + invitations,
      totalInvitations: invitations,
    }
  })
}

async function walk(
  list: (params: QueryParams) => Promise<Array<{ id: string }>>,
  pages: number,
  limit = L,
) {
  const seen: string[] = []
  const more: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    seen.push(...(await list(params)).map((r) => r.id))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, more }
}

describe('ConcordAdapter auth and base URL', () => {
  it('sends the documented X-API-KEY header on the production base URL', async () => {
    const { sent } = fakeAgreements(1, 'SIGNING')
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    expect(sent[0]!.baseURL).toBe('https://api.concordnow.com/api/rest/1')
    expect(sent[0]!.headers['X-API-KEY']).toBe('key-1')
    expect(sent[0]!.headers['Authorization']).toBeUndefined()
  })

  it('refuses before sending when the connection has no organization id', async () => {
    const { spy } = fakeAgreements(1, 'SIGNING')
    await expect(
      adapter.listEnvelopes(
        { accessToken: 'key-1', extra: {} },
        withPageSink({ page: 1, limit: L }),
      ),
    ).rejects.toThrow(/organizationId/)
    expect(spy).not.toHaveBeenCalled()
  })

  it('exchanges apiKey + organizationId, and has no OAuth flow', async () => {
    await expect(
      adapter.exchangeCredentials({ apiKey: 'k', organizationId: '42' }),
    ).resolves.toEqual({
      accessToken: 'k',
      extra: { organizationId: '42' },
    })
    await expect(
      adapter.exchangeCredentials({ apiKey: 'k', organizationId: 'acme' }),
    ).rejects.toThrow()
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['apiKey', 'organizationId'])
    expect(() => adapter.getAuthUrl('s')).toThrow(/API key/)
  })
})

describe('ConcordAdapter.listEnvelopes', () => {
  it('asks for exactly the envelope stages: no template, invitation or trash stage', async () => {
    const { sent } = fakeAgreements(1, 'SIGNING')
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    expect(sent[0]!.params?.['statuses']).toEqual([
      'DRAFT',
      'VALIDATION',
      'NEGOTIATION',
      'SIGNING',
      'UNKNOWN_CONTRACT',
      'FUTURE_CONTRACT',
      'CURRENT_CONTRACT',
      'COMPLETED_CONTRACT',
      'COMPLETED_CANCEL_CONTRACT',
      'COMPLETED_CONTRACT_RENEWABLE',
      'BROKEN',
    ])
  })

  it("reads each row's signing order and signers from its SignatureGet reply", async () => {
    const { sent } = fakeAgreements(2, 'SIGNING')
    const out = await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    expect(out.map((e) => EnvelopeSchema.parse(e).signingOrder)).toEqual(['sequential', 'parallel'])
    expect(out.map((e) => e.signerIds)).toEqual([['1001'], ['1002']])
    expect(
      sent
        .map((s) => s.url)
        .slice(1)
        .sort(),
    ).toEqual([
      '/organizations/42/agreements/agr-1/signature',
      '/organizations/42/agreements/agr-2/signature',
    ])
  })

  it('sends the caller page 0-based with its exact size, statuses exploded', async () => {
    const { sent } = fakeAgreements(N, 'SIGNING')
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 3, limit: L }))
    expect(sent[0]!.params).toMatchObject({ page: 2, numberOfItemsByPage: L, isInboxed: false })
    expect(sent[0]!.params?.['statuses']).not.toContain('TEMPLATE')
    expect(sent[0]!.params?.['statuses']).not.toContain('TEMPLATE_AUTO')
    expect(sent[0]!.params?.['statuses']).toContain('SIGNING')
    expect(sent[0]!.query).toContain('statuses=DRAFT&statuses=VALIDATION')
    expect(sent[0]!.query).not.toContain('statuses[]')
  })

  it(`walks N = 2L+1 = ${N} agreements: every id once, hasMore exact`, async () => {
    fakeAgreements(N, 'CURRENT_CONTRACT')
    const { seen, more } = await walk((p) => adapter.listEnvelopes(CREDS, p), 3)
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `agr-${i + 1}`))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('an exact multiple of L ends on the last full page because total says so', async () => {
    fakeAgreements(2 * L, 'SIGNING')
    const { seen, more } = await walk((p) => adapter.listEnvelopes(CREDS, p), 2)
    expect(seen).toHaveLength(2 * L)
    expect(more).toEqual([true, false])
  })

  it('a full page at the end still ends when total counts invitations the page will never hold', async () => {
    fakeAgreements(2 * L, 'SIGNING', 3)
    const { seen, more } = await walk((p) => adapter.listEnvelopes(CREDS, p), 3)
    expect(seen).toHaveLength(2 * L)
    // total counts invitations, so page 2 cannot tell it is the last: it
    // reports more, and page 3 comes back empty. Over-reporting costs one
    // empty page; subtracting totalInvitations is unverified and would lose
    // rows if the items did hold invitations.
    expect(more).toEqual([true, true, false])
  })

  it('every envelope parses with the canonical schema', async () => {
    fakeAgreements(1, 'SIGNING')
    const [env] = await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    expect(EnvelopeSchema.parse(env).status).toBe('sent')
  })

  it('throws when Concord serves fewer items per page than asked', async () => {
    fakeAxios(() => ({
      items: [],
      numberOfItems: 0,
      numberOfItemsByPage: 1,
      page: 0,
      total: 0,
      totalInvitations: 0,
    }))
    await expect(adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /items per page/,
    )
  })
})

describe('ConcordAdapter.getEnvelope', () => {
  const serve = (status: string) =>
    fakeAxios((url) => {
      if (url === '/organizations/42/agreements/01sp9L4YEZNcLHaSV8447N') {
        return { ...GET_AGREEMENT_EXAMPLE, metadata: { ...GET_AGREEMENT_EXAMPLE.metadata, status } }
      }
      if (url === '/organizations/42/agreements/01sp9L4YEZNcLHaSV8447N/signature') {
        return { enforceOrder: true, slots: [SIGNED_SLOT_EXAMPLE, OPEN_SLOT_EXAMPLE] }
      }
      throw new Error(url)
    })

  it('reads GetAgreement and SignatureGet on the organization path', async () => {
    const { sent } = serve('DRAFT')
    const env = EnvelopeSchema.parse(await adapter.getEnvelope(CREDS, '01sp9L4YEZNcLHaSV8447N'))
    expect(env.subject).toBe('Non-Disclosure Agreement')
    expect(env.signingOrder).toBe('sequential')
    expect(env.signerIds).toEqual(['33'])
    expect(sent.every((s) => s.params === undefined)).toBe(true)
  })

  it('path-encodes the agreement uid', async () => {
    const { sent } = fakeAxios((url) => {
      if (url === '/organizations/42/agreements/a%2Fb') {
        return { ...GET_AGREEMENT_EXAMPLE, uid: 'a/b' }
      }
      if (url === '/organizations/42/agreements/a%2Fb/signature') return { enforceOrder: false }
      throw new Error(url)
    })
    expect((await adapter.getEnvelope(CREDS, 'a/b')).id).toBe('a/b')
    expect(sent.map((s) => s.url)).toEqual([
      '/organizations/42/agreements/a%2Fb',
      '/organizations/42/agreements/a%2Fb/signature',
    ])
  })

  it('a template or trashed agreement is a 404, as listEnvelopes never returns it', async () => {
    for (const status of ['TEMPLATE', 'TEMPLATE_AUTO', 'TRASHED', 'NEGO_INVITE']) {
      const { sent } = serve(status)
      await expect(adapter.getEnvelope(CREDS, '01sp9L4YEZNcLHaSV8447N')).rejects.toMatchObject({
        statusCode: 404,
      })
      expect(sent).toHaveLength(1)
      vi.restoreAllMocks()
    }
  })
})

describe('ConcordAdapter.listTemplates', () => {
  it('asks only for the TEMPLATE and TEMPLATE_AUTO stages', async () => {
    const { sent } = fakeAgreements(1, 'TEMPLATE')
    await adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: L }))
    expect(sent[0]!.params?.['statuses']).toEqual(['TEMPLATE', 'TEMPLATE_AUTO'])
  })

  it("documentCount is the length of each template's attachments reply", async () => {
    fakeAgreements(3, 'TEMPLATE')
    const out = await adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: 3 }))
    expect(out.map((t) => TemplateSchema.parse(t).documentCount)).toEqual([1, 2, 3])
  })

  it(`walks N = ${N} templates: every id once, hasMore exact`, async () => {
    fakeAgreements(N, 'TEMPLATE_AUTO')
    const { seen, more } = await walk((p) => adapter.listTemplates(CREDS, p), 3)
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `agr-${i + 1}`))
    expect(more).toEqual([true, true, false])
  })

  it('templates parse with the canonical schema, and getTemplate reads GetAgreement', async () => {
    const { sent } = fakeAxios((url, params) => {
      if (url === AGREEMENTS_PATH) {
        return {
          items: [{ ...AGREEMENT_LIST_ITEM_EXAMPLE, status: 'TEMPLATE' }],
          numberOfItems: 1,
          numberOfItemsByPage: L,
          page: 0,
          total: 1,
          totalInvitations: 0,
        }
      }
      if (url === '/organizations/42/agreements/tpl-1') {
        return {
          ...GET_AGREEMENT_EXAMPLE,
          uid: 'tpl-1',
          metadata: { ...GET_AGREEMENT_EXAMPLE.metadata, status: 'TEMPLATE' },
        }
      }
      if (url === '/organizations/42/agreements/draft-1') {
        return { ...GET_AGREEMENT_EXAMPLE, uid: 'draft-1' }
      }
      if (url.endsWith('/attachments')) {
        only(params, [])
        return { attachments: [ATTACHMENT_EXAMPLE, ATTACHMENT_EXAMPLE] }
      }
      throw new Error(url)
    })
    const [t] = await adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: L }))
    expect(TemplateSchema.parse(t).name).toBe('Non')
    const got = TemplateSchema.parse(await adapter.getTemplate(CREDS, 'tpl-1'))
    expect(got.id).toBe('tpl-1')
    expect(got.documentCount).toBe(2)
    sent.length = 0
    await expect(adapter.getTemplate(CREDS, 'draft-1')).rejects.toMatchObject({ statusCode: 404 })
    expect(sent.map((s) => s.url)).toEqual(['/organizations/42/agreements/draft-1'])
  })
})

describe('ConcordAdapter.listSigners', () => {
  const slots = Array.from({ length: N }, (_, i) => ({ ...GROUP_SLOT_EXAMPLE, id: 100 + i }))

  it(`reads the /signature slots and pages N = ${N} locally: every id once, hasMore exact`, async () => {
    const { sent } = fakeAxios((url, params) => {
      if (url !== '/organizations/42/agreements/agr-1/signature') throw new Error(url)
      only(params, [])
      return { enforceOrder: false, autoRequest: false, signatureProvider: 'CONCORD', slots }
    })
    const { seen, more } = await walk((p) => adapter.listSigners(CREDS, 'agr-1', p), 3)
    expect(seen).toEqual(slots.map((s) => String(s.id)))
    expect(more).toEqual([true, true, false])
    expect(sent.every((s) => s.params === undefined)).toBe(true)
  })

  it('skips an open slot that names no signer and parses the rest', async () => {
    fakeAxios(() => ({ slots: [SIGNED_SLOT_EXAMPLE, OPEN_SLOT_EXAMPLE, GROUP_SLOT_EXAMPLE] }))
    const out = await adapter.listSigners(CREDS, 'agr-1', withPageSink({ page: 1, limit: 10 }))
    expect(out.map((s) => SignerSchema.parse(s).id)).toEqual(['33', '34'])
  })

  it('a SignatureMetadataGet without slots (not a required property) is no signers', async () => {
    fakeAxios(() => ({ enforceOrder: false }))
    await expect(
      adapter.listSigners(CREDS, 'agr-1', withPageSink({ page: 1, limit: L })),
    ).resolves.toEqual([])
  })

  it('a malformed slots value throws rather than read as no signers', async () => {
    fakeAxios(() => ({ enforceOrder: false, slots: { id: 1 } }))
    await expect(
      adapter.listSigners(CREDS, 'agr-1', withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/not an array/)
  })

  it('getSigner refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    const { spy } = fakeAxios(() => ({}))
    await expect(adapter.getSigner(CREDS, '33')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('ConcordAdapter.listDocuments', () => {
  const attachments = Array.from({ length: N }, (_, i) => ({
    ...ATTACHMENT_EXAMPLE,
    id: `att-${i + 1}`,
  }))

  it(`reads the attachments and pages N = ${N} locally: every id once, order global`, async () => {
    fakeAxios((url, params) => {
      if (url !== '/organizations/42/agreements/agr-1/attachments') throw new Error(url)
      only(params, [])
      return { attachments }
    })
    const params = withPageSink({ page: 2, limit: L })
    const page2 = await adapter.listDocuments(CREDS, 'agr-1', params)
    expect(page2.map((d) => DocumentSchema.parse(d).order)).toEqual([2, 3])
    const { seen, more } = await walk((p) => adapter.listDocuments(CREDS, 'agr-1', p), 3)
    expect(seen).toEqual(attachments.map((a) => a.id))
    expect(more).toEqual([true, true, false])
  })

  it('a reply without the required attachments array throws, never an empty list', async () => {
    fakeAxios(() => ({}))
    await expect(
      adapter.listDocuments(CREDS, 'agr-1', withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/did not return an array/)
  })

  it('getDocument refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    const { spy } = fakeAxios(() => ({}))
    await expect(adapter.getDocument(CREDS, 'att-1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('ConcordAdapter.listAuditTrailEntries', () => {
  const activities = Array.from({ length: N }, (_, i) => ({
    ...AUDIT_ACTIVITY_EXAMPLE,
    id: `act-${i + 1}`,
  }))
  const serve = () =>
    fakeAxios((url, params) => {
      if (url !== '/organizations/42/agreements/agr-1/activities') throw new Error(url)
      only(params, ['type'])
      if (params?.['type'] !== 'AUDIT') throw new Error('type must be AUDIT')
      return { activities }
    })

  it(`sends type=AUDIT and pages N = ${N} locally: every id once, hasMore exact`, async () => {
    serve()
    const { seen, more } = await walk((p) => adapter.listAuditTrailEntries(CREDS, 'agr-1', p), 3)
    expect(seen).toEqual(activities.map((a) => `agr-1:${a.id}`))
    expect(more).toEqual([true, true, false])
  })

  it('a reply without the required activities array throws, never an empty list', async () => {
    fakeAxios(() => ({}))
    await expect(
      adapter.listAuditTrailEntries(CREDS, 'agr-1', withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/did not return an array/)
  })

  it('reads an entry back by the id the list returned', async () => {
    serve()
    const [first] = await adapter.listAuditTrailEntries(
      CREDS,
      'agr-1',
      withPageSink({ page: 2, limit: L }),
    )
    const again = AuditTrailEntrySchema.parse(await adapter.getAuditTrailEntry(CREDS, first!.id))
    expect(again.externalId).toBe('act-3')
    await expect(adapter.getAuditTrailEntry(CREDS, 'agr-1:nope')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
