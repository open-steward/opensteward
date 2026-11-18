/**
 * Omniva listLabels: refused with 501 NOT_SUPPORTED before any request.
 *
 * The OMX API Manual for Customers
 * (https://www.omniva.ee/wp-content/uploads/sites/7/2025/08/OMX-API-Manual-for-Customers_nov.pdf),
 * section 1.7 "Request label", documents package-labels only as a request for
 * labels of named barcodes, with a mandatory barcode list:
 *
 *   barcodes []  yes  array, string(5-30)  Shipment barcodes that labels are requested for.
 *
 * There is no label collection to list or page, so the adapter's old
 * `GET shipments/package-labels` (with no barcodes) read nothing real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import { OmnivaAdapter } from '../../../../../../src/verticals/logistics/adapters/omniva/index'

const CREDS = { accessToken: 'user:pass' }

describe('omniva listLabels is refused before any request', () => {
  const request = vi.fn()
  const get = vi.fn()
  const post = vi.fn()

  beforeEach(() => {
    vi.spyOn(axios, 'create').mockReturnValue({
      request,
      get,
      post,
      defaults: { headers: {} },
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    } as unknown as ReturnType<typeof axios.create>)
    vi.spyOn(axios, 'get').mockImplementation(get)
    vi.spyOn(axios, 'request').mockImplementation(request)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    request.mockReset()
    get.mockReset()
    post.mockReset()
  })

  it('throws 501 NOT_SUPPORTED naming the barcodes requirement and sends nothing', async () => {
    const adapter = new OmnivaAdapter()
    const err = await adapter.listLabels(CREDS, withPageSink({ page: 1, limit: 5 })).then(
      () => {
        throw new Error('listLabels resolved')
      },
      (e: unknown) => e as Error & { statusCode?: number; code?: string },
    )
    expect(err.message).toMatch(/Omniva cannot list labels/)
    expect(err.message).toMatch(/barcodes/)
    expect(err.statusCode).toBe(501)
    expect(err.code).toBe('NOT_SUPPORTED')
    expect(request).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
})
