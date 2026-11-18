import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { CryptomathicSignerClient } from '../../../../../../src/verticals/docsign/adapters/cryptomathic-signer/client'
import { CryptomathicSignerAdapter } from '../../../../../../src/verticals/docsign/adapters/cryptomathic-signer'

/**
 * CSC API v2 `credentials/list` takes no paging parameter. Its input table
 * lists only userID, credentialInfo, certificates, certInfo, authInfo,
 * onlyValid, lang and clientData, and its output is "credentialIDs REQUIRED
 * Array of String One or more credentialID(s) associated with the provided or
 * implicit userID." (https://cloudsignatureconsortium.org/wp-content/uploads/2023/04/csc-api-v2.0.0.2.pdf,
 * section 11.4). `maxResults` / `pageToken` / `nextPageToken` were CSC v1 and
 * appear nowhere in the v2 document. One call returns every credential, so
 * the adapter must page the collection itself, or page 2 repeats page 1.
 *
 * `credentials/info` (section 11.5) "Retrieves the credential" — one object,
 * hence one signer per envelope.
 */

const CREDS = {
  accessToken: 'tok',
  extra: { baseUrl: 'https://rssp.example.test', userID: 'user-1' },
} as unknown as Credentials
const L = 2
const N = 2 * L + 1
const IDS = Array.from({ length: N }, (_, i) => `cred-${i}`)

const V2_LIST_INPUTS = new Set([
  'userID',
  'credentialInfo',
  'certificates',
  'certInfo',
  'authInfo',
  'onlyValid',
  'lang',
  'clientData',
])

function info(id: string) {
  return {
    credentialID: id,
    description: `key ${id}`,
    key: { status: 'enabled', algo: ['1.2.840.113549.1.1.11'], len: 2048 },
    cert: {
      status: 'valid',
      subjectDN: `CN=Owner ${id},O=Acme,C=ES`,
      issuerDN: 'CN=Acme CA,O=Acme,C=ES',
      serialNumber: '00AA',
      validFrom: '20200101000000Z',
      validTo: '20300101000000Z',
    },
    auth: { mode: 'explicit' },
    multisign: 1,
  }
}

/**
 * Honours only the documented v2 inputs: the whole collection on every call,
 * and a reject for any parameter the v2 input table does not list.
 */
function mockCsc(opts: { withInfos: boolean; ids?: string[]; infoWithoutId?: boolean }) {
  const ids = opts.ids ?? IDS
  return vi
    .spyOn(CryptomathicSignerClient.prototype, 'post')
    .mockImplementation(async (path: string, body?: Record<string, unknown>) => {
      if (path === '/credentials/list') {
        for (const k of Object.keys(body ?? {})) {
          if (!V2_LIST_INPUTS.has(k)) throw new Error(`undocumented credentials/list input ${k}`)
        }
        return (
          opts.withInfos
            ? {
                credentialIDs: ids,
                credentialInfos: ids.map((id) => {
                  const i = info(id)
                  if (!opts.infoWithoutId) return i
                  const { credentialID: _omit, ...rest } = i
                  return rest
                }),
              }
            : { credentialIDs: ids }
        ) as never
      }
      if (path === '/credentials/info') {
        const id = String(body?.['credentialID'])
        return info(id) as never
      }
      throw new Error(`unexpected path ${path}`)
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new CryptomathicSignerAdapter()

describe.each([
  ['credentialInfos returned inline', true],
  ['credentialIDs only, resolved via credentials/info', false],
])('CryptomathicSignerAdapter.listEnvelopes pages locally (%s)', (_label, withInfos) => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    mockCsc({ withInfos })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listEnvelopes(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(IDS)
    expect(more).toEqual([true, true, false])
  })

  it('page 2 sends only documented v2 inputs and is not page 1', async () => {
    const post = mockCsc({ withInfos })
    const p1 = await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    const p2 = await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    expect(p2.map((r) => r.id)).toEqual(IDS.slice(L, 2 * L))
    expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
    const listCalls = post.mock.calls.filter(([p]) => p === '/credentials/list')
    for (const [, body] of listCalls) {
      expect(body).not.toHaveProperty('maxResults')
      expect(body).not.toHaveProperty('pageToken')
      expect(body?.['userID']).toBe('user-1')
    }
  })

  it('a limit above the collection returns it all and reports its end', async () => {
    mockCsc({ withInfos })
    const params = withPageSink({ page: 1, limit: 1000 })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(IDS)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockCsc({ withInfos })
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listEnvelopes(CREDS, params)
    const env = listPage(rows, params, 'cryptomathic-signer')
    expect(env.data.map((r) => r.id)).toEqual(IDS.slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(L)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('CryptomathicSignerAdapter.listEnvelopes resolves only the page it serves', () => {
  it('calls credentials/info only for the ids on the requested page', async () => {
    const post = mockCsc({ withInfos: false })
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    const infoIds = post.mock.calls
      .filter(([p]) => p === '/credentials/info')
      .map(([, b]) => b?.['credentialID'])
    expect(infoIds).toEqual(IDS.slice(L, 2 * L))
  })
})

describe('CryptomathicSignerAdapter.listEnvelopes edge cases', () => {
  it('ignores a caller cursor: no v1 pageToken is sent', async () => {
    const post = mockCsc({ withInfos: true })
    const params = { ...withPageSink({ page: 2, limit: L }), cursor: 'x' }
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(IDS.slice(L, 2 * L))
    const listCalls = post.mock.calls.filter(([p]) => p === '/credentials/list')
    expect(listCalls.length).toBeGreaterThan(0)
    for (const [, body] of listCalls) expect(body).not.toHaveProperty('pageToken')
  })

  it('aligns the index-based credentialID fallback before slicing', async () => {
    mockCsc({ withInfos: true, infoWithoutId: true })
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(IDS.slice(L, 2 * L))
  })

  it('uses inline credentialInfos without a credentials/info call', async () => {
    const post = mockCsc({ withInfos: true })
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    expect(post.mock.calls.filter(([p]) => p === '/credentials/info')).toEqual([])
  })

  it.each([true, false])(
    'returns more than 100 rows when the limit allows (inline=%s)',
    async (withInfos) => {
      const big = Array.from({ length: 150 }, (_, i) => `cred-${i}`)
      mockCsc({ withInfos, ids: big })
      const params = withPageSink({ page: 1, limit: 200 })
      const rows = await adapter.listEnvelopes(CREDS, params)
      expect(rows.map((r) => r.id)).toEqual(big)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    },
  )
})

describe('CryptomathicSignerAdapter.listSigners pages its single owner locally', () => {
  const ENV = 'cred-0'

  it('page 1 holds the owner and reports the end; page 2 is empty', async () => {
    mockCsc({ withInfos: true })
    const p1 = withPageSink({ page: 1, limit: 1 })
    const rows1 = await adapter.listSigners(CREDS, ENV, p1)
    expect(rows1.map((r) => r.id)).toEqual([`${ENV}:${ENV}`])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    expect(readUpstreamPage(p1)?.totalCount).toBe(1)
    expect(readUpstreamPage(p1)?.pagedLocally).toBe(true)

    const p2 = withPageSink({ page: 2, limit: 1 })
    const rows2 = await adapter.listSigners(CREDS, ENV, p2)
    expect(rows2).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockCsc({ withInfos: true })
    const params = parseListQuery({ page: '2', limit: '1' })
    const rows = await adapter.listSigners(CREDS, ENV, params)
    const env = listPage(rows, params, 'cryptomathic-signer')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })

  it('getSigner still resolves the owner', async () => {
    mockCsc({ withInfos: true })
    const s = await adapter.getSigner(CREDS, `${ENV}:${ENV}`)
    expect(s.id).toBe(`${ENV}:${ENV}`)
  })
})
