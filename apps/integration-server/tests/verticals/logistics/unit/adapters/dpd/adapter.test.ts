/**
 * DPD UK (api.dpd.co.uk). The API docs are partner-gated (www.dpd.co.uk/apidocs/
 * answers 404), so this adapter changes only what DPD's own host proves.
 *
 * Live probes of https://api.dpd.co.uk on 2026-09-24:
 *   POST /v1/user/?action=login  -> 404 "Cannot POST /esgServer/v1/user/?action=login"
 *   POST /user/?action=login     -> 401 "Unauthorized"
 *   GET  /v1/network             -> 404 "Cannot GET /esgServer/v1/network"
 *   GET  /shipping/network/      -> 200 {"error":{"errorCode":"1007",...,
 *        "errorMessage":"Missing mandatory field","obj":"collectionDetails.address.postcode"},"data":null}
 *
 * So the login route lives at the host root, not under /v1/, and the only
 * network endpoint is a lookup for one collection/delivery lane rather than a
 * collection of carriers. listCarriers returns DPD's static self-descriptor.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { DPDAdapter } from '../../../../../../src/verticals/logistics/adapters/dpd/index'
import { exchangeCredentials } from '../../../../../../src/verticals/logistics/adapters/dpd/auth'
import { DPD_API_BASE } from '../../../../../../src/verticals/logistics/adapters/dpd/constants'

const CREDS = { accessToken: 'tok' }

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('DPD API base', () => {
  it('is the host root, where the login route answers', () => {
    expect(DPD_API_BASE).toBe('https://api.dpd.co.uk/')
  })

  it('posts the login to https://api.dpd.co.uk/user/?action=login', async () => {
    const fetchMock = vi.fn(async () => new Response('Unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(exchangeCredentials('u', 'p')).rejects.toThrow('DPD login failed (401)')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.dpd.co.uk/user/?action=login')
    expect(init.method).toBe('POST')
  })
})

describe('DPDAdapter.listCarriers', () => {
  function spyOnRequests() {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const create = vi.spyOn(axios, 'create')
    return { fetchMock, create }
  }

  it('sends no request: the network endpoint is a lane lookup, not a carrier list', async () => {
    const { fetchMock, create } = spyOnRequests()
    const rows = await new DPDAdapter().listCarriers(CREDS, { page: 1, limit: 10 })
    expect(rows).toEqual([{ id: 'dpd', name: 'DPD', code: 'dpd' }])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it.each([1, 5])(
    'walks the one-row collection at limit %i: every id once, hasMore exact',
    async (limit) => {
      spyOnRequests()
      const adapter = new DPDAdapter()
      const seen: string[] = []
      for (let page = 1; page <= 3; page++) {
        const params = withPageSink({ page, limit })
        const rows = await adapter.listCarriers(CREDS, params)
        seen.push(...rows.map((r) => r.id as string))
        const meta = readUpstreamPage(params)
        expect(meta?.totalCount).toBe(1)
        expect(meta?.hasMore).toBe(false)
        expect(meta?.pagedLocally).toBe(true)
        if (page > 1) expect(rows).toEqual([])
      }
      expect(seen).toEqual(['dpd'])
    },
  )
})
