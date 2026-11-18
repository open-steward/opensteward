/**
 * eSignly signer / document / audit-trail reads, rebuilt onto the documented API.
 *
 * Source: eSignly's API reference, https://www.esignly.com/api-docs.html,
 * which renders https://www.esignly.com/eSignlyDec16-postmanCollection.json.
 *
 * - Signers: "Get Document status" is
 *   `POST {{design_base_url}}/v1/checkSignStatus/` with formdata
 *   `api_key`, `signature_request_id`, `api_domain`, and returns the whole
 *   `signatures[]` array with no paging parameters, so it is paged locally.
 * - Documents and audit-trail entries: none of the collection's requests
 *   returns a document manifest or an audit trail, so both refuse with 501
 *   before sending anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, PageMaxBearing } from '@opensteward/shared'
import { EsignlyClient } from '../../../../../../src/verticals/docsign/adapters/esignly/client'
import { EsignlyAdapter } from '../../../../../../src/verticals/docsign/adapters/esignly'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { CHECK_SIGN_STATUS_EXAMPLE } from './check-sign-status.fixture'

const CREDS = { accessToken: 'esignly_key_abc' } as Credentials
const REQ = '3449c3227474d304508b1d14b3684c54'
const L = 2
const N = 2 * L + 1

afterEach(() => vi.restoreAllMocks())

const adapter = new EsignlyAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

/** Documented body keys of "Get Document status". */
const CHECK_SIGN_STATUS_KEYS = new Set(['signature_request_id', 'api_domain'])

/**
 * A fake `POST /checkSignStatus/` honouring only the documented body keys.
 * It returns every signature at once — the endpoint takes no paging keys.
 */
function fakeCheckSignStatus(total: number) {
  const template = CHECK_SIGN_STATUS_EXAMPLE.signatures[0]!
  const signatures = Array.from({ length: total }, (_, i) => ({
    ...template,
    signature_id: String(142692 + i),
    user_key: String(707319997 + i),
  }))
  return vi
    .spyOn(EsignlyClient.prototype, 'post')
    .mockImplementation(async (path: string, body?: Record<string, unknown>) => {
      if (path !== '/checkSignStatus/') throw new Error(`undocumented path ${path}`)
      for (const k of Object.keys(body ?? {})) {
        if (!CHECK_SIGN_STATUS_KEYS.has(k)) throw new Error(`undocumented body key ${k}`)
      }
      if (body?.['signature_request_id'] !== REQ)
        return { ...CHECK_SIGN_STATUS_EXAMPLE, signatures: [] } as never
      return { ...CHECK_SIGN_STATUS_EXAMPLE, signatures } as never
    })
}

describe('EsignlyAdapter.listSigners → POST /checkSignStatus/', () => {
  const expected = Array.from({ length: N }, (_, i) => `${REQ}:${142692 + i}`)

  it('sends only the documented signature_request_id and parses signatures[]', async () => {
    const post = fakeCheckSignStatus(2)
    const get = vi.spyOn(EsignlyClient.prototype, 'get')
    const rows = await adapter.listSigners(CREDS, REQ, {})
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('/checkSignStatus/', { signature_request_id: REQ })
    expect(get).not.toHaveBeenCalled()
    expect(rows.map((r) => SignerSchema.parse(r).externalId)).toEqual(['142692', '142693'])
  })

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    fakeCheckSignStatus(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listSigners(CREDS, REQ, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(expected)
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    fakeCheckSignStatus(N)
    const params = withPageSink(
      parseListQuery({ page: '2', limit: String(L) }, adapter as PageMaxBearing),
    )
    const rows = await adapter.listSigners(CREDS, REQ, params)
    const env = listPage(rows, params, 'esignly')
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta.hasMore).toBe(true)
  })

  it('getSigner reads back an id that listSigners returned', async () => {
    fakeCheckSignStatus(N)
    const [, second] = await adapter.listSigners(CREDS, REQ, {})
    const got = await adapter.getSigner(CREDS, second!.id)
    expect(got.id).toBe(second!.id)
  })
})

describe('EsignlyClient.post (documented transport)', () => {
  function fakeAxios(response: unknown) {
    const calls: Array<{ url: string; body: unknown; config: unknown }> = []
    const instance = {
      post: vi.fn(async (url: string, body: unknown, config?: unknown) => {
        calls.push({ url, body, config })
        return { data: response }
      }),
      get: vi.fn(),
    }
    vi.spyOn(axios, 'create').mockReturnValue(instance as never)
    return calls
  }

  it('posts multipart form-data carrying api_key and the given fields to the v1 host', async () => {
    const calls = fakeAxios(CHECK_SIGN_STATUS_EXAMPLE)
    const createSpy = vi.mocked(axios.create)
    await new EsignlyClient(CREDS).post('/checkSignStatus/', { signature_request_id: REQ })
    expect(createSpy.mock.calls[0]![0]).toMatchObject({ baseURL: 'https://acc.esignly.com/v1' })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('/checkSignStatus/')
    const body = calls[0]!.body
    expect(body).toBeInstanceOf(FormData)
    const form = body as FormData
    expect(form.get('api_key')).toBe('esignly_key_abc')
    expect(form.get('signature_request_id')).toBe(REQ)
    expect([...form.keys()].sort()).toEqual(['api_key', 'signature_request_id'])
  })

  it('drops null and undefined fields instead of posting them as strings', async () => {
    const calls = fakeAxios(CHECK_SIGN_STATUS_EXAMPLE)
    await new EsignlyClient(CREDS).post('/checkSignStatus/', {
      signature_request_id: REQ,
      page: undefined,
      result_per_page: null,
    })
    const form = calls[0]!.body as FormData
    expect([...form.keys()].sort()).toEqual(['api_key', 'signature_request_id'])
  })

  it('throws the documented has_error body instead of returning it as data', async () => {
    fakeAxios({
      status_code: 420,
      has_error: true,
      error_details: 'Invalid Request Key',
      requested_api_key: '481dfdsa4174b993bcdsfat6sdBBSTesbbb40',
      message: '',
    })
    await expect(
      new EsignlyClient(CREDS).post('/checkSignStatus/', { signature_request_id: REQ }),
    ).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('Invalid Request Key'),
    })
  })
})

describe.each([
  ['listDocuments', () => adapter.listDocuments(CREDS, REQ, withPageSink({ page: 1, limit: L }))],
  ['getDocument', () => adapter.getDocument(CREDS, `${REQ}:0`)],
  [
    'listAuditTrailEntries',
    () => adapter.listAuditTrailEntries(CREDS, REQ, withPageSink({ page: 1, limit: L })),
  ],
  ['getAuditTrailEntry', () => adapter.getAuditTrailEntry(CREDS, `${REQ}:0`)],
] as const)('EsignlyAdapter.%s refuses', (_name, call) => {
  it('throws 501 NOT_SUPPORTED and sends no request', async () => {
    const post = vi.spyOn(EsignlyClient.prototype, 'post')
    const get = vi.spyOn(EsignlyClient.prototype, 'get')
    const create = vi.spyOn(axios, 'create')
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(post).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})
