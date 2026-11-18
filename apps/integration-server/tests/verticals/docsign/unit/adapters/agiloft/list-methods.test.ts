/**
 * Agiloft lists records only through Search, and reads one through Read:
 *
 *   REST Interface (https://help.agiloft.com/space/HELP/43715778):
 *     "| Search | GET/POST | /ewws/EWSearch | Supports saved search and ad hoc queries |"
 *     "| Functional request | Authorization: Bearer <token> | GET https://server/ewws/EWSearch?
 *      $KB=Demo&$table=body&$lang=en& field=id&field=text&field=body&query=... |"
 *     JSON decorator: "https://<hostname>/ewws/EWRead/.json?$KB=KB&$table=<table>&…&id=<id>"
 *     → {"success":true,"message":"","result":{...,"id":21}}
 *   REST - Search (https://help.agiloft.com/space/HELP/43717730):
 *     "This operation allows retrieval of results page by page (pagination) using "page" and
 *      "limit" parameters." / "Page numbers start with 0 (zero)." / "When a page is not found,
 *      an empty result is returned."
 *   REST - Saved Search (https://help.agiloft.com/space/HELP/43714188):
 *     "the Contract table, using its logical name of `contract`"
 *
 * The fake below serves EWSearch/EWRead from those documented parameters ONLY
 * ($KB, $table, $lang, field, page, limit, id). Anything else is ignored, as
 * the platform would, so an adapter that pages by offset gets page 0 again.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { AgiloftAdapter } from '../../../../../../src/verticals/docsign/adapters/agiloft/index'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'

const CREDS: Credentials = {
  accessToken: 'tok',
  refreshToken: 'ref',
  extra: { host: 'acme.agiloft.com', kb: 'Demo' },
}
const adapter = new AgiloftAdapter({ clientId: 'cid', clientSecret: 'sec', redirectUri: 'x' })

interface Call {
  path: string
  params: Record<string, unknown>
  serializer: unknown
}

let calls: Call[]
let createConfig: { baseURL?: string; headers?: Record<string, string> } | undefined

function contracts(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: 100 + i, contract_title1: `Contract ${i}` }))
}

/** A fake Agiloft server over `rows`, honouring only documented parameters. */
function fakeAgiloft(rows: Array<{ id: number; contract_title1: string }>) {
  calls = []
  const get = vi.fn(
    async (
      path: string,
      config?: { params?: Record<string, unknown>; paramsSerializer?: unknown },
    ) => {
      const p = config?.params ?? {}
      calls.push({ path, params: p, serializer: config?.paramsSerializer })
      if (p['$KB'] !== 'Demo' || p['$table'] !== 'contract' || typeof p['$lang'] !== 'string') {
        return {
          data: { success: false, message: 'One has to specify $table, $KB, $lang parameters' },
        }
      }
      if (path === '/EWSearch/.json') {
        const fields = ([] as unknown[]).concat(p['field'] ?? [])
        const page = Number(p['page'] ?? 0)
        const limit = Number(p['limit'] ?? 0)
        const slice =
          limit === 0 ? (page === 0 ? rows : []) : rows.slice(page * limit, page * limit + limit)
        const result = slice.map((r) =>
          Object.fromEntries(
            fields.map((f) => [String(f), (r as Record<string, unknown>)[String(f)] ?? null]),
          ),
        )
        return { data: { success: true, message: '', result } }
      }
      if (path === '/EWRead/.json') {
        const row = rows.find((r) => String(r.id) === String(p['id']))
        // No documented message for an unknown id: the fake sends none.
        if (!row) return { data: { success: false } }
        return { data: { success: true, message: '', result: { ...row, company_name: 'Acme' } } }
      }
      throw new Error(`undocumented path ${path}`)
    },
  )
  vi.spyOn(axios, 'create').mockImplementation(((cfg: typeof createConfig) => {
    createConfig = cfg
    return { get } as unknown as ReturnType<typeof axios.create>
  }) as unknown as typeof axios.create)
  return get
}

beforeEach(() => {
  calls = []
  createConfig = undefined
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('agiloft listEnvelopes — EWSearch on the contract table', () => {
  it('sends the documented Search request with a Bearer token on the customer server', async () => {
    fakeAgiloft(contracts(3))
    await adapter.listEnvelopes(CREDS, { page: 1, limit: 25 })

    expect(createConfig?.baseURL).toBe('https://acme.agiloft.com/ewws')
    expect(createConfig?.headers?.['Authorization']).toBe('Bearer tok')
    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('/EWSearch/.json')
    expect(calls[0].params).toMatchObject({
      $KB: 'Demo',
      $table: 'contract',
      $lang: 'en',
      field: ['id', 'contract_title1'],
      page: 0,
      limit: 25,
      // "include the parameter err_code_resp=1 to receive specific response codes"
      err_code_resp: 1,
    })
    // No credentials in the URL: the token goes in the header.
    expect(calls[0].params).not.toHaveProperty('$login')
    expect(calls[0].params).not.toHaveProperty('$password')
    // Repeated field=… pairs, not field[]=…
    expect(calls[0].serializer).toEqual({ indexes: null })
  })

  it('maps the page 1-based → 0-based and sends the caller limit as is', async () => {
    fakeAgiloft(contracts(3))
    await adapter.listEnvelopes(CREDS, { page: 4, limit: 7 })
    expect(calls[0].params).toMatchObject({ page: 3, limit: 7 })
  })

  it.each([0, -3])('never sends limit %i: 0 is documented as "all records"', async (limit) => {
    fakeAgiloft(contracts(3))
    await adapter.listEnvelopes(CREDS, { page: 1, limit })
    expect(calls[0].params['limit']).toBe(100)
  })

  it('floors a fractional limit rather than sending it', async () => {
    fakeAgiloft(contracts(3))
    await adapter.listEnvelopes(CREDS, { page: 1, limit: 2.5 })
    expect(calls[0].params['limit']).toBe(2)
  })

  it('sends a large caller limit unchanged: no maximum is documented', async () => {
    fakeAgiloft(contracts(3))
    await adapter.listEnvelopes(CREDS, { page: 1, limit: 5000 })
    expect(calls[0].params['limit']).toBe(5000)
  })

  it('returns canonical envelopes parsed from the documented reply', async () => {
    fakeAgiloft(contracts(2))
    const out = await adapter.listEnvelopes(CREDS, { page: 1, limit: 10 })
    expect(out.map((e) => EnvelopeSchema.parse(e).id)).toEqual(['100', '101'])
    expect(out[0].subject).toBe('Contract 0')
  })

  it('walks N = 2L+1 contracts: every id once, hasMore exact', async () => {
    const L = 4
    const N = 2 * L + 1
    fakeAgiloft(contracts(N))
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params: QueryParams = withPageSink({ page, limit: L })
      const rows = await adapter.listEnvelopes(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(contracts(N).map((c) => String(c.id)))
    expect(new Set(seen).size).toBe(N)
    expect(hasMore).toEqual([true, true, false])
  })

  it('reports no more rows on an empty page past the end', async () => {
    fakeAgiloft(contracts(2))
    const params = withPageSink({ page: 5, limit: 2 })
    expect(await adapter.listEnvelopes(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('surfaces a {success:false} reply as an error instead of an empty page', async () => {
    fakeAgiloft(contracts(2))
    await expect(
      adapter.listEnvelopes(
        { ...CREDS, extra: { host: 'acme.agiloft.com', kb: 'Other' } },
        { page: 1, limit: 2 },
      ),
    ).rejects.toThrow('Agiloft EWSearch failed: One has to specify $table, $KB, $lang parameters')
  })
})

describe('agiloft getEnvelope — EWRead on the contract table', () => {
  it('reads back an id the list returned', async () => {
    fakeAgiloft(contracts(3))
    const [first] = await adapter.listEnvelopes(CREDS, { page: 1, limit: 1 })
    const env = EnvelopeSchema.parse(await adapter.getEnvelope(CREDS, first.id))

    expect(env.id).toBe(first.id)
    expect(env.subject).toBe('Contract 0')
    const read = calls.at(-1)!
    expect(read.path).toBe('/EWRead/.json')
    expect(read.params).toMatchObject({ $KB: 'Demo', $table: 'contract', $lang: 'en', id: '100' })
  })

  it('surfaces a missing record as an error', async () => {
    fakeAgiloft(contracts(1))
    await expect(adapter.getEnvelope(CREDS, '999')).rejects.toThrow(
      'Agiloft EWRead failed: reply is not success:true',
    )
  })
})

/** Point axios.create at a scripted `get`, for replies the documented fake never sends. */
function scripted(get: (...args: unknown[]) => Promise<unknown>) {
  const fn = vi.fn(get)
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get: fn,
  })) as unknown as typeof axios.create)
  return fn
}

function httpError(status: number, message: string) {
  return Object.assign(new Error(`HTTP ${status}`), {
    response: { status, data: { success: false, message } },
  })
}

describe('agiloft client — replies outside the happy path', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('treats success:true with no result as an empty EWSearch page', async () => {
    scripted(async () => ({ data: { success: true, message: '' } }))
    const params = withPageSink({ page: 3, limit: 2 })
    expect(await adapter.listEnvelopes(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('refuses success:true with no result on EWRead', async () => {
    scripted(async () => ({ data: { success: true, message: '' } }))
    await expect(adapter.getEnvelope(CREDS, '100')).rejects.toThrow(
      'Agiloft EWRead failed: no result in the reply',
    )
  })

  it('does not retry a 500: the error table uses it for a revoked token', async () => {
    const get = scripted(async () => {
      throw httpError(500, 'No active session found for current token')
    })
    await expect(adapter.listEnvelopes(CREDS, { page: 1, limit: 2 })).rejects.toThrow('HTTP 500')
    expect(get).toHaveBeenCalledTimes(1)
  })

  it.each([429, 503])('retries a transient %i and then succeeds', async (status) => {
    vi.useFakeTimers()
    let n = 0
    const get = scripted(async () => {
      if (n++ === 0) throw httpError(status, '')
      return { data: { success: true, message: '', result: contracts(1) } }
    })
    const pending = adapter.listEnvelopes(CREDS, { page: 1, limit: 2 })
    await vi.runAllTimersAsync()
    expect((await pending).map((e) => e.id)).toEqual(['100'])
    expect(get).toHaveBeenCalledTimes(2)
  })
})

describe('agiloft refuses what its REST interface cannot list', () => {
  const refusals: Array<[string, () => Promise<unknown>, RegExp]> = [
    [
      'listDocuments',
      () => adapter.listDocuments(CREDS, '100', { page: 1, limit: 10 }),
      /^Agiloft cannot list documents: /,
    ],
    ['getDocument', () => adapter.getDocument(CREDS, '100:1'), /^Agiloft cannot get documents: /],
    [
      'listAuditTrailEntries',
      () => adapter.listAuditTrailEntries(CREDS, '100', { page: 1, limit: 10 }),
      /^Agiloft cannot list audit trail entries: /,
    ],
    [
      'getAuditTrailEntry',
      () => adapter.getAuditTrailEntry(CREDS, '100:1'),
      /^Agiloft cannot get audit trail entries: /,
    ],
  ]

  it.each(refusals)(
    '%s throws 501 NOT_SUPPORTED and sends no request',
    async (_name, call, message) => {
      const get = fakeAgiloft(contracts(3))
      const err = await call().then(
        () => undefined,
        (e: unknown) => e as Error & { statusCode?: number; code?: string },
      )
      expect(err).toBeInstanceOf(Error)
      expect(err?.message).toMatch(message)
      expect(err?.statusCode).toBe(501)
      expect(err?.code).toBe('NOT_SUPPORTED')
      expect(get).not.toHaveBeenCalled()
      expect(axios.create).not.toHaveBeenCalled()
    },
  )
})
