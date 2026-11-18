/**
 * Dynamics 365 SCM: listStockLevels refuses before sending anything.
 *
 * Stock levels come from the Inventory Visibility on-hand query, POST
 * /api/environment/{environmentId}/onhand/indexquery. Its documented filters
 * cannot ask for "all stock": under either data partition rule the query needs
 * product ids or site and location ids, and the adapter has neither. The
 * method used to send all three arrays empty, a body both rules exclude, and
 * then returned the same first slice for every page.
 *
 * First-party https://learn.microsoft.com/en-us/dynamics365/supply-chain/inventory/inventory-visibility-api
 * ("Query data stored by location"):
 *
 *   "productId can contain one or more values. If it's an empty array, the
 *   system will return all products for the specified sites and locations. In
 *   this case, siteId and locationId shouldn't be empty."
 *
 *   "siteId and locationId are used for partitioning. [...] If both arrays are
 *   empty, the system will return all sites and locations for the specified
 *   products. In this case, productId shouldn't be empty."
 *
 * ("Query data stored by product ID"):
 *
 *   "In this case, two filters fields are required: organizationId, productId."
 *   "productId should be an array with at least one value."
 *
 * The list contract passes only page, limit, updatedAfter and search, so there
 * is no product, site or location to send.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { Dynamics365ScmAdapter } from '../../../../../../src/verticals/inventory/adapters/dynamics-365-scm/index'

const CREDS: Credentials = {
  accessToken: 'odata-token',
  extra: {
    tenantHost: 'contoso.operations.dynamics.com',
    environmentId: '11111111-2222-3333-4444-555555555555',
    organizationId: 'usmf',
    ivAccessToken: 'iv-token',
  },
}

describe('dynamics-365-scm listStockLevels refuses without a request', () => {
  let sent: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sent = vi.fn(() => {
      throw new Error('dynamics-365-scm sent a request')
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

  for (const page of [1, 2]) {
    it(`throws 501 NOT_SUPPORTED on page ${page}`, async () => {
      const adapter = new Dynamics365ScmAdapter()
      await expect(adapter.listStockLevels(CREDS, { page, limit: 50 })).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(/Dynamics 365 SCM cannot list stock levels/),
      })
      expect(sent).not.toHaveBeenCalled()
    })
  }

  it('refuses a call that carries updatedAfter too', async () => {
    const adapter = new Dynamics365ScmAdapter()
    await expect(
      adapter.listStockLevels(CREDS, {
        page: 1,
        limit: 50,
        updatedAfter: new Date('2026-01-01T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(sent).not.toHaveBeenCalled()
  })
})
