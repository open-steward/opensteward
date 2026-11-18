/**
 * JOOR listVariants / getVariant refuse with 501 before sending anything.
 *
 * GET /v4/skus (https://api-docs.jooraccess.com/reference/get-skus.md)
 * documents these SKU fields only: id, product_id, identifiers,
 * trait_values, external_id, sku_identifier. None is a price. v4 documents
 * prices as write-only ("Create prices for your SKUs", POST
 * /prices/bulk_create; https://api-docs.jooraccess.com/reference/prices.md
 * lists no read), so the canonical ProductVariant.price, which is required,
 * has no documented source. The adapter used to write
 * `{ amount: 0, currency: 'USD' }`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { JoorAdapter } from '../../../../../../src/verticals/ecommerce/adapters/joor/index'

const CREDS = { accessToken: 'tok', extra: { accountId: 'acct-1' } }

function spyHttp() {
  const get = vi.fn(async () => ({ data: { data: [] } }))
  const post = vi.fn(async () => ({ data: { data: [] } }))
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post, defaults: {} } as never)
  return { get, post, create }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('JOOR variants are refused', () => {
  it('listVariants throws 501 NOT_SUPPORTED and sends no request', async () => {
    const http = spyHttp()
    const adapter = new JoorAdapter({ clientId: 'c', clientSecret: 's' })
    const params = withPageSink({ page: 1, limit: 10 } as QueryParams)
    await expect(adapter.listVariants(CREDS, params)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('JOOR cannot list variants'),
    })
    expect(http.get).not.toHaveBeenCalled()
    expect(http.post).not.toHaveBeenCalled()
    expect(http.create).not.toHaveBeenCalled()
  })

  it('listVariants refuses even with a documented product_ids filter', async () => {
    const http = spyHttp()
    const adapter = new JoorAdapter({ clientId: 'c', clientSecret: 's' })
    const params = withPageSink({ page: 1, limit: 10, productId: '25' } as QueryParams)
    await expect(adapter.listVariants(CREDS, params)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(http.get).not.toHaveBeenCalled()
  })

  it('getVariant throws 501 NOT_SUPPORTED and sends no request', async () => {
    const http = spyHttp()
    const adapter = new JoorAdapter({ clientId: 'c', clientSecret: 's' })
    await expect(adapter.getVariant(CREDS, '3')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('JOOR cannot read a variant'),
    })
    expect(http.get).not.toHaveBeenCalled()
    expect(http.create).not.toHaveBeenCalled()
  })
})
