/**
 * Namirial list/get reads, rebuilt onto the documented eSignAnyWhere v6 API.
 *
 * Source: https://demo.esignanywhere.net/swagger/jsons/swagger.v6.json
 * (`"basePath": "/api"`).
 *
 * - Envelopes: `POST /v6/envelope/find` ("Get basic information about
 *   envelopes which match your filter criteria") takes only optional filters
 *   and returns the whole `Envelopes` array, so it is paged locally; each
 *   served row is read with `GET /v6/envelope/{envelopeId}` and
 *   `GET /v6/envelope/{envelopeId}/files`.
 * - Signers: the `Activities` of `GET /v6/envelope/{envelopeId}`.
 * - Documents: the `Documents` of `GET /v6/envelope/{envelopeId}/files`.
 * - Audit trail: the `Events` of `GET /v6/envelope/{envelopeId}/history`.
 * - Templates: `POST /v6/template/find`, then `GET /v6/template/{templateId}`
 *   and `GET /v6/template/{templateId}/files` per served row.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  setDnsResolver,
  withPageSink,
} from '@opensteward/shared'
import type { Credentials, PageMaxBearing, QueryParams } from '@opensteward/shared'
import { NamirialAdapter } from '../../../../../../src/verticals/docsign/adapters/namirial'
import { NamirialClient } from '../../../../../../src/verticals/docsign/adapters/namirial/client'
import type {
  RawNamirialEnvelopeActivity,
  RawNamirialHistoryEvent,
} from '../../../../../../src/verticals/docsign/adapters/namirial/types'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { AuditTrailEntrySchema } from '../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { TemplateSchema } from '../../../../../../src/verticals/docsign/schema/template'
import {
  ENVELOPE_FILES_EXAMPLE,
  ENVELOPE_FIND_EXAMPLE,
  ENVELOPE_GET_EXAMPLE,
  ENVELOPE_HISTORY_EXAMPLE,
  ENVELOPE_ID,
  TEMPLATE_FILES_EXAMPLE,
  TEMPLATE_FIND_EXAMPLE,
  TEMPLATE_GET_EXAMPLE,
} from './fixtures'

const CREDS: Credentials = {
  accessToken: 'namirial_token_abc',
  extra: { host: 'saas.esignanywhere.net' },
}
const L = 2
const N = 2 * L + 1

afterEach(() => {
  vi.restoreAllMocks()
  setDnsResolver(undefined)
})

const adapter = new NamirialAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

/** Documented `EnvelopeFindRequest` / `TemplateFindRequest` keys — all filters. */
const ENVELOPE_FIND_KEYS = new Set([
  'StartDate',
  'EndDate',
  'SearchText',
  'Status',
  'InStatusSinceDays',
  'SenderEmail',
  'CompletedByRecipientWithEmail',
  'RecipientEmail',
  'WaitingForRecipientWithEmail',
  'EnvelopeBulkParentId',
])
const TEMPLATE_FIND_KEYS = new Set(['SearchText', 'RecipientEmail'])

const envId = (i: number) => `e0000000-0000-0000-0000-${String(i).padStart(12, '0')}`
const tplId = (i: number) => `t0000000-0000-0000-0000-${String(i).padStart(12, '0')}`
const actId = (i: number) => `a0000000-0000-0000-0000-${String(i).padStart(12, '0')}`
const fileId = (i: number) => `f0000000-0000-0000-0000-${String(i).padStart(12, '0')}`

function signActivity(i: number): RawNamirialEnvelopeActivity {
  return {
    Id: actId(i),
    Status: 'Pending',
    Action: {
      Sign: {
        ContactInformation: { Email: `s${i}@example.com`, GivenName: 'Signer', Surname: String(i) },
        SigningGroup: 1,
      },
    },
  }
}

interface FakeOptions {
  envelopes?: number
  templates?: number
  activities?: number
  documents?: number
  /** History events; every other one is not yet completed. */
  events?: number
}

/**
 * A fake eSignAnyWhere honouring only documented routes and body keys. GETs
 * take no query parameters anywhere in the v6 routes used here.
 */
function fakeApi(opts: FakeOptions) {
  const envelopes = Array.from({ length: opts.envelopes ?? 0 }, (_, i) => ({
    ...ENVELOPE_FIND_EXAMPLE.Envelopes![0]!,
    Id: envId(i),
  }))
  const templates = Array.from({ length: opts.templates ?? 0 }, (_, i) => ({
    ...TEMPLATE_FIND_EXAMPLE.Templates![0]!,
    Id: tplId(i),
  }))
  const activities = Array.from({ length: opts.activities ?? 0 }, (_, i) => signActivity(i))
  const documents = Array.from({ length: opts.documents ?? 0 }, (_, i) => ({
    ...ENVELOPE_FILES_EXAMPLE.Documents![0]!,
    FileId: fileId(i),
    FileName: `doc-${i}.pdf`,
    DocumentNumber: i + 1,
  }))
  const events: RawNamirialHistoryEvent[] = Array.from({ length: opts.events ?? 0 }, (_, i) => ({
    ...ENVELOPE_HISTORY_EXAMPLE.Events![0]!,
    Completed: i % 2 === 0,
  }))

  const post = vi
    .spyOn(NamirialClient.prototype, 'post')
    .mockImplementation(async (path: string, body?: Record<string, unknown>) => {
      const keys =
        path === '/v6/envelope/find'
          ? ENVELOPE_FIND_KEYS
          : path === '/v6/template/find'
            ? TEMPLATE_FIND_KEYS
            : undefined
      if (!keys) throw new Error(`undocumented POST ${path}`)
      for (const k of Object.keys(body ?? {})) {
        if (!keys.has(k)) throw new Error(`undocumented body key ${k} on ${path}`)
      }
      if (path === '/v6/envelope/find') return { Envelopes: envelopes } as never
      return { Templates: templates } as never
    })

  const get = vi
    .spyOn(NamirialClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (params !== undefined) throw new Error(`undocumented query on ${path}`)
      let m: RegExpExecArray | null
      if ((m = /^\/v6\/envelope\/([^/]+)$/.exec(path)))
        return {
          ...ENVELOPE_GET_EXAMPLE,
          Id: decodeURIComponent(m[1]!),
          ...(opts.activities !== undefined ? { Activities: activities } : {}),
        } as never
      if ((m = /^\/v6\/envelope\/([^/]+)\/files$/.exec(path)))
        return opts.documents !== undefined
          ? ({ ...ENVELOPE_FILES_EXAMPLE, Documents: documents } as never)
          : (ENVELOPE_FILES_EXAMPLE as never)
      if (/^\/v6\/envelope\/[^/]+\/history$/.test(path))
        return { ...ENVELOPE_HISTORY_EXAMPLE, Events: events } as never
      if ((m = /^\/v6\/template\/([^/]+)$/.exec(path)))
        return { ...TEMPLATE_GET_EXAMPLE, Id: decodeURIComponent(m[1]!) } as never
      if (/^\/v6\/template\/[^/]+\/files$/.test(path)) return TEMPLATE_FILES_EXAMPLE as never
      throw new Error(`undocumented GET ${path}`)
    })
  return { get, post }
}

async function walk<T extends { id: string }>(
  list: (params: QueryParams) => Promise<T[]>,
): Promise<{ seen: string[]; more: Array<boolean | undefined> }> {
  const seen: string[] = []
  const more: Array<boolean | undefined> = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit: L })
    const rows = await list(params)
    expect(rows.length).toBeLessThanOrEqual(L)
    seen.push(...rows.map((r) => r.id))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, more }
}

describe('NamirialAdapter.listEnvelopes → POST /v6/envelope/find', () => {
  const expected = Array.from({ length: N }, (_, i) => envId(i))

  it('posts an empty filter to the documented route and reads each row in full', async () => {
    const { get, post } = fakeApi({ envelopes: 1 })
    const rows = await adapter.listEnvelopes(CREDS, {})
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('/v6/envelope/find', {})
    expect(get.mock.calls.map((c) => c[0]).sort()).toEqual([
      `/v6/envelope/${envId(0)}`,
      `/v6/envelope/${envId(0)}/files`,
    ])
    expect(rows.map((r) => EnvelopeSchema.parse(r).id)).toEqual([envId(0)])
  })

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    fakeApi({ envelopes: N })
    const { seen, more } = await walk((p) => adapter.listEnvelopes(CREDS, p))
    expect(seen).toEqual(expected)
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('reads only the rows of the requested page', async () => {
    const { get } = fakeApi({ envelopes: N })
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get.mock.calls.map((c) => c[0]).sort()).toEqual(
      [envId(2), envId(3)]
        .flatMap((id) => [`/v6/envelope/${id}`, `/v6/envelope/${id}/files`])
        .sort(),
    )
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    fakeApi({ envelopes: N })
    const params = withPageSink(
      parseListQuery({ page: '2', limit: String(L) }, adapter as PageMaxBearing),
    )
    const rows = await adapter.listEnvelopes(CREDS, params)
    const env = listPage(rows, params, 'namirial')
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta.hasMore).toBe(true)
  })

  it('getEnvelope reads back an id that listEnvelopes returned', async () => {
    fakeApi({ envelopes: N })
    const [, second] = await adapter.listEnvelopes(CREDS, {})
    const got = await adapter.getEnvelope(CREDS, second!.id)
    expect(EnvelopeSchema.parse(got).id).toBe(second!.id)
  })
})

describe('NamirialAdapter.listSigners → GET /v6/envelope/{envelopeId}', () => {
  const expected = Array.from({ length: N }, (_, i) => `${ENVELOPE_ID}:${actId(i)}`)

  it('reads the envelope overview and maps its Activities', async () => {
    const { get, post } = fakeApi({ activities: 2 })
    const rows = await adapter.listSigners(CREDS, ENVELOPE_ID, {})
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(`/v6/envelope/${ENVELOPE_ID}`)
    expect(post).not.toHaveBeenCalled()
    expect(rows.map((r) => SignerSchema.parse(r).id)).toEqual(expected.slice(0, 2))
  })

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    fakeApi({ activities: N })
    const { seen, more } = await walk((p) => adapter.listSigners(CREDS, ENVELOPE_ID, p))
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('getSigner reads back an id that listSigners returned', async () => {
    fakeApi({ activities: N })
    const [, second] = await adapter.listSigners(CREDS, ENVELOPE_ID, {})
    expect((await adapter.getSigner(CREDS, second!.id)).id).toBe(second!.id)
  })

  it('getSigner refuses an id without an envelope part, sending nothing', async () => {
    const { get } = fakeApi({ activities: 1 })
    await expect(adapter.getSigner(CREDS, actId(0))).rejects.toMatchObject({ statusCode: 400 })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('NamirialAdapter.listDocuments → GET /v6/envelope/{envelopeId}/files', () => {
  const expected = Array.from({ length: N }, (_, i) => `${ENVELOPE_ID}:${fileId(i)}`)

  it('reads the files route and maps its Documents', async () => {
    const { get } = fakeApi({ documents: 2 })
    const rows = await adapter.listDocuments(CREDS, ENVELOPE_ID, {})
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(`/v6/envelope/${ENVELOPE_ID}/files`)
    expect(rows.map((r) => DocumentSchema.parse(r).id)).toEqual(expected.slice(0, 2))
  })

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    fakeApi({ documents: N })
    const { seen, more } = await walk((p) => adapter.listDocuments(CREDS, ENVELOPE_ID, p))
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('getDocument reads back an id that listDocuments returned', async () => {
    fakeApi({ documents: N })
    const [, second] = await adapter.listDocuments(CREDS, ENVELOPE_ID, {})
    expect((await adapter.getDocument(CREDS, second!.id)).id).toBe(second!.id)
  })
})

describe('NamirialAdapter.listAuditTrailEntries → GET /v6/envelope/{envelopeId}/history', () => {
  // 2N events, every other one completed: the completed ones sit at even indexes.
  const expected = Array.from({ length: N }, (_, i) => `${ENVELOPE_ID}:${2 * i}`)

  it('reads the history route and keeps only events that have happened', async () => {
    const { get } = fakeApi({ events: 4 })
    const rows = await adapter.listAuditTrailEntries(CREDS, ENVELOPE_ID, {})
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(`/v6/envelope/${ENVELOPE_ID}/history`)
    expect(rows.map((r) => AuditTrailEntrySchema.parse(r).id)).toEqual(expected.slice(0, 2))
  })

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    fakeApi({ events: 2 * N })
    const { seen, more } = await walk((p) => adapter.listAuditTrailEntries(CREDS, ENVELOPE_ID, p))
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('getAuditTrailEntry reads back an id that listAuditTrailEntries returned', async () => {
    fakeApi({ events: 2 * N })
    const [, second] = await adapter.listAuditTrailEntries(CREDS, ENVELOPE_ID, {})
    expect((await adapter.getAuditTrailEntry(CREDS, second!.id)).id).toBe(second!.id)
  })

  it('getAuditTrailEntry does not serve an event that has not happened', async () => {
    fakeApi({ events: 2 * N })
    await expect(adapter.getAuditTrailEntry(CREDS, `${ENVELOPE_ID}:1`)).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('NamirialAdapter.listTemplates → POST /v6/template/find', () => {
  const expected = Array.from({ length: N }, (_, i) => tplId(i))

  it('posts an empty filter to the documented route and reads each row in full', async () => {
    const { get, post } = fakeApi({ templates: 1 })
    const rows = await adapter.listTemplates(CREDS, {})
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('/v6/template/find', {})
    expect(get.mock.calls.map((c) => c[0]).sort()).toEqual([
      `/v6/template/${tplId(0)}`,
      `/v6/template/${tplId(0)}/files`,
    ])
    expect(rows.map((r) => TemplateSchema.parse(r).id)).toEqual([tplId(0)])
  })

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    fakeApi({ templates: N })
    const { seen, more } = await walk((p) => adapter.listTemplates(CREDS, p))
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('getTemplate reads back an id that listTemplates returned', async () => {
    fakeApi({ templates: N })
    const [, second] = await adapter.listTemplates(CREDS, {})
    expect((await adapter.getTemplate(CREDS, second!.id)).id).toBe(second!.id)
  })
})

describe('NamirialClient (documented transport)', () => {
  function fakeAxios(response: unknown) {
    const calls: Array<{ method: string; url: string; body?: unknown }> = []
    const instance = {
      get: vi.fn(async (url: string) => {
        calls.push({ method: 'GET', url })
        return { data: response }
      }),
      post: vi.fn(async (url: string, body: unknown) => {
        calls.push({ method: 'POST', url, body })
        return { data: response }
      }),
    }
    const create = vi.spyOn(axios, 'create').mockReturnValue(instance as never)
    return { calls, create }
  }

  it('targets https://<host>/api with the token as a Bearer header', async () => {
    setDnsResolver(async () => [{ address: '93.184.216.34' }])
    const { calls, create } = fakeAxios(ENVELOPE_FIND_EXAMPLE)
    await new NamirialClient(CREDS).post('/v6/envelope/find', {})
    expect(create.mock.calls[0]![0]).toMatchObject({
      baseURL: 'https://saas.esignanywhere.net/api',
      headers: { Authorization: 'Bearer namirial_token_abc' },
    })
    expect(calls).toEqual([{ method: 'POST', url: '/v6/envelope/find', body: {} }])
  })

  it('refuses a connection without a host before building a client', () => {
    fakeAxios({})
    expect(() => new NamirialClient({ accessToken: 't' })).toThrow(/host is not configured/)
  })

  it('refuses a host that resolves to a private address, sending nothing', async () => {
    setDnsResolver(async () => [{ address: '10.0.0.5' }])
    const { calls } = fakeAxios({})
    await expect(new NamirialClient(CREDS).get('/v6/envelope/x')).rejects.toThrow()
    expect(calls).toEqual([])
  })

  it('refuses a private host on POST too, sending nothing', async () => {
    setDnsResolver(async () => [{ address: '10.0.0.5' }])
    const { calls } = fakeAxios({})
    await expect(new NamirialClient(CREDS).post('/v6/envelope/find', {})).rejects.toThrow()
    expect(calls).toEqual([])
  })

  it('encodes an id before placing it in a path segment', async () => {
    setDnsResolver(async () => [{ address: '93.184.216.34' }])
    const { calls } = fakeAxios(ENVELOPE_GET_EXAMPLE)
    await adapter.getEnvelope(CREDS, 'a/b c').catch(() => undefined)
    expect(calls.map((c) => c.url).sort()).toEqual([
      '/v6/envelope/a%2Fb%20c',
      '/v6/envelope/a%2Fb%20c/files',
    ])
  })

  it('exchangeCredentials refuses a host that resolves to a private address', async () => {
    setDnsResolver(async () => [{ address: '10.0.0.5' }])
    await expect(
      adapter.exchangeCredentials({ apiKey: 'tok', host: 'https://saas.esignanywhere.net' }),
    ).rejects.toThrow()
  })

  it('exchangeCredentials stores the normalised host and refuses http', async () => {
    setDnsResolver(async () => [{ address: '93.184.216.34' }])
    await expect(
      adapter.exchangeCredentials({ apiKey: ' tok ', host: 'https://SAAS.esignanywhere.net/Api' }),
    ).resolves.toEqual({ accessToken: 'tok', extra: { host: 'saas.esignanywhere.net' } })
    await expect(
      adapter.exchangeCredentials({ apiKey: 'tok', host: 'http://saas.esignanywhere.net' }),
    ).rejects.toThrow(/https/)
    await expect(adapter.exchangeCredentials({ apiKey: 'tok' })).rejects.toThrow(/host is required/)
  })
})
