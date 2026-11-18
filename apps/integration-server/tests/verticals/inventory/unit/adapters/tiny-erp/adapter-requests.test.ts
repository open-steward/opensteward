/**
 * Pins the actual HTTP request shape tiny-erp sends — an audit found the
 * transform tests exercised the mapping logic but nothing pinned the base URL
 * or the purchase-order path, so both were wrong (403 on every route, 404 on
 * every purchase-order call) with a fully green test suite.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { TinyErpAdapter } from '../../../../../../src/verticals/inventory/adapters/tiny-erp'
import { TinyErpClient } from '../../../../../../src/verticals/inventory/adapters/tiny-erp/client'
import { API_BASE_URL } from '../../../../../../src/verticals/inventory/adapters/tiny-erp/constants'

const creds = { accessToken: 'tok' } as Credentials

function adapter(): TinyErpAdapter {
  return new TinyErpAdapter({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'https://example.com/callback',
  })
}

afterEach(() => vi.restoreAllMocks())

describe('tiny-erp API_BASE_URL', () => {
  it('points at api.tiny.com.br/public-api/v3, not the 403ing erp.tiny.com.br/api/v3 host', () => {
    expect(API_BASE_URL).toBe('https://api.tiny.com.br/public-api/v3')
  })
})

describe('TinyErpAdapter purchase order requests', () => {
  it('lists purchase orders from /ordem-compra, not the old /ordens-de-compra path', async () => {
    const get = vi.spyOn(TinyErpClient.prototype, 'get').mockResolvedValue({ itens: [] } as never)
    await adapter().listPurchaseOrders(creds, {})
    expect(get).toHaveBeenCalledWith('/ordem-compra', expect.any(Object))
  })

  it('gets a single purchase order from /ordem-compra/{id}, not /ordens-de-compra/{id}', async () => {
    const get = vi.spyOn(TinyErpClient.prototype, 'get').mockResolvedValue({ id: 42 } as never)
    await adapter().getPurchaseOrder(creds, '42')
    expect(get).toHaveBeenCalledWith('/ordem-compra/42')
  })
})
