/**
 * Asset Panda's read methods refuse before sending anything.
 *
 * Assets, and the records in the "Locations" group, are group objects. The
 * only documented way to read group objects is "Search objects",
 * POST /v3/groups/{group_id}/search/objects
 * (https://team-asset-panda.readme.io/reference/post_v3-groups-group-id-search-objects.md),
 * and its OpenAPI block documents the 200 response only as
 *
 *   "200": { "description": "Successful response", "content": { "application/json": {} } }
 *
 * so there is no documented row key, object field or end-of-list signal to
 * build a Product, StockLevel or Location from. The adapter used to post to
 * /groups/{id}/search-objects (the ReadMe page slug, not the API path) with
 * limit/offset in the JSON body, after reading `entities` from GET /v3/groups,
 * whose documented sample is keyed "groups". Against the real API that always
 * returned an empty list, which a sync reads as "the collection is empty".
 *
 * The single-record reads used GET /v3/entity-objects/{id}, which is not in
 * the documented v3 endpoint index (https://team-asset-panda.readme.io/llms.txt).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import http from 'node:http'
import https from 'node:https'
import type { Credentials } from '@opensteward/shared'
import { AssetPandaAdapter } from '../../../../../../src/verticals/inventory/adapters/asset-panda/index'

const CREDS: Credentials = {
  accessToken: 'jwt',
  extra: { clientId: 'cid', clientSecret: 'secret' },
}

describe('asset-panda read methods refuse without a request', () => {
  let sent: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sent = vi.fn(() => {
      throw new Error('asset-panda sent a request')
    })
    vi.spyOn(axios, 'create').mockImplementation(sent as never)
    vi.spyOn(axios, 'get').mockImplementation(sent as never)
    vi.spyOn(axios, 'post').mockImplementation(sent as never)
    vi.spyOn(axios, 'request').mockImplementation(sent as never)
    vi.spyOn(http, 'request').mockImplementation(sent as never)
    vi.spyOn(http, 'get').mockImplementation(sent as never)
    vi.spyOn(https, 'request').mockImplementation(sent as never)
    vi.spyOn(https, 'get').mockImplementation(sent as never)
    vi.stubGlobal('fetch', sent)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const lists = [
    ['listProducts', /^Asset Panda cannot list products: .*"application\/json": \{\}/],
    ['listStockLevels', /^Asset Panda cannot list stock levels: .*"application\/json": \{\}/],
    ['listLocations', /^Asset Panda cannot list locations: .*"application\/json": \{\}/],
  ] as const

  for (const [method, message] of lists) {
    it(`${method} throws 501 NOT_SUPPORTED`, async () => {
      const adapter = new AssetPandaAdapter({})
      const call = adapter[method].bind(adapter)
      await expect(call(CREDS, { page: 1, limit: 50 })).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(message),
      })
      expect(sent).not.toHaveBeenCalled()
    })

    it(`${method} refuses on later pages and with updatedAfter too`, async () => {
      const adapter = new AssetPandaAdapter({})
      const call = adapter[method].bind(adapter)
      await expect(
        call(CREDS, { page: 3, limit: 7, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
      ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(sent).not.toHaveBeenCalled()
    })
  }

  const gets = [
    ['getProduct', /^Asset Panda cannot read a product/],
    ['getStockLevel', /^Asset Panda cannot read a stock level/],
    ['getLocation', /^Asset Panda cannot read a location/],
  ] as const

  for (const [method, message] of gets) {
    it(`${method} throws 501 NOT_SUPPORTED`, async () => {
      const adapter = new AssetPandaAdapter({})
      const call = adapter[method].bind(adapter)
      await expect(call(CREDS, '63d775cd232fd50067104c9a')).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(message),
      })
      expect(sent).not.toHaveBeenCalled()
    })
  }
})
