/**
 * Acctivate has no pull API, so the adapter's list methods refuse before
 * sending anything.
 *
 * First-party https://docs.acctivate.com/docs/ConfigurationWebStore.html:
 *
 *   "Acctivate does not provide a "Web Services API". Instead, we leverage
 *   the existing API provided by your shopping cart / eCommerce platform."
 *
 * The Native XML protocol at
 * https://docs.acctivate.com/docs/IntegrationWebStoreNative.html is one a web
 * store implements for Acctivate to call: "The Native web store template
 * requires a web developer to implement a web service that uses Acctivate's
 * native XML schema." Inventory flows outward only, in the UpdateInventory
 * POST Acctivate sends to the web store: "Web Store Sync sends inventory qtys
 * for all products in Acctivate." QueryConfiguration, which both list methods
 * used to call, answers with a <Requests> capability list and no <Product>
 * elements, so they always returned an empty list, which a sync reads as
 * "the collection is empty".
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AcctivateAdapter } from '../../../../../../src/verticals/inventory/adapters/acctivate/index'

const CREDS: Credentials = {
  accessToken: 'web-store-password',
  extra: { username: 'acctivate', serviceUrl: 'https://store.example.com/api.php' },
}

describe('acctivate list methods refuse without a request', () => {
  let sent: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sent = vi.fn(() => {
      throw new Error('acctivate sent a request')
    })
    vi.spyOn(axios, 'create').mockImplementation(sent as never)
    vi.spyOn(axios, 'get').mockImplementation(sent as never)
    vi.spyOn(axios, 'post').mockImplementation(sent as never)
    vi.spyOn(axios, 'request').mockImplementation(sent as never)
    vi.stubGlobal('fetch', sent)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const cases = [
    ['listProducts', /Acctivate cannot list products/],
    ['listStockLevels', /Acctivate cannot list stock levels/],
  ] as const

  for (const [method, message] of cases) {
    it(`${method} throws 501 NOT_SUPPORTED`, async () => {
      const adapter = new AcctivateAdapter()
      const call = adapter[method]!.bind(adapter)
      await expect(call(CREDS, { page: 1, limit: 50 })).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(message),
      })
      expect(sent).not.toHaveBeenCalled()
    })

    it(`${method} refuses on later pages and with updatedAfter too`, async () => {
      const adapter = new AcctivateAdapter()
      const call = adapter[method]!.bind(adapter)
      await expect(
        call(CREDS, { page: 3, limit: 7, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
      ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(sent).not.toHaveBeenCalled()
    })
  }

  it('declares no get methods for the refused resources', () => {
    const adapter = new AcctivateAdapter() as unknown as Record<string, unknown>
    expect(adapter['getProduct']).toBeUndefined()
    expect(adapter['getStockLevel']).toBeUndefined()
  })
})
