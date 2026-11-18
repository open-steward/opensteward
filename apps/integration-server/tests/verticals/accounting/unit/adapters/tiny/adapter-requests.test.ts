/**
 * Pins the actual HTTP request shape accounting/tiny sends — an audit found
 * the sibling inventory/tiny-erp adapter's base URL returned 403 on every
 * route with a fully green transform-only test suite. accounting/tiny shared
 * the identical base-URL defect (constants.ts), so this pins the fixed base
 * and the purchase-order path here too.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { TinyAdapter } from '../../../../../../src/verticals/accounting/adapters/tiny'
import { TinyClient } from '../../../../../../src/verticals/accounting/adapters/tiny/client'
import { TINY_API_BASE } from '../../../../../../src/verticals/accounting/adapters/tiny/constants'

const creds = { accessToken: 'tok' } as Credentials

function adapter(): TinyAdapter {
  return new TinyAdapter({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'https://example.com/callback',
    scopes: ['openid'],
  })
}

afterEach(() => vi.restoreAllMocks())

describe('tiny TINY_API_BASE', () => {
  it('points at api.tiny.com.br/public-api/v3, not the 403ing erp.tiny.com.br/api/v3 host', () => {
    expect(TINY_API_BASE).toBe('https://api.tiny.com.br/public-api/v3')
  })
})

describe('TinyAdapter purchase order requests', () => {
  it('lists purchase orders from ordem-compra', async () => {
    const list = vi
      .spyOn(TinyClient.prototype, 'list')
      .mockResolvedValue({ itens: [], paginacao: { totalRegistros: 0, limite: 0, offset: 0 } })
    await adapter().listPurchaseOrders(creds, {})
    expect(list).toHaveBeenCalledWith('ordem-compra', expect.any(Object))
  })

  it('gets a single purchase order from ordem-compra/{id}', async () => {
    const get = vi.spyOn(TinyClient.prototype, 'get').mockResolvedValue({ id: 42 } as never)
    await adapter().getPurchaseOrder(creds, '42')
    expect(get).toHaveBeenCalledWith('ordem-compra/42')
  })
})
