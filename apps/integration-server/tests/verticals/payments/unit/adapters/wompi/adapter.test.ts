/**
 * Wompi read methods against the documented API.
 *
 * Wompi's complete API reference (linked from
 * https://docs.wompi.co/docs/colombia/referencia/) is the OpenAPI spec at
 * https://api.swaggerhub.com/apis/waybox/wompi/1.2.0. Its paths are
 * /payment_links, /payment_sources, /transactions, /transactions/{id}/void,
 * /tokens/*, /merchants/{publicKey} and /pse/financial_institutions — no
 * /customers and no /charges. Refunds are documented separately at
 * https://docs.wompi.co/docs/colombia/reembolsos/.
 *
 * - getCharge reads GET /transactions/{transaction_id} ("Dado un ID de
 *   transacción, el API retorna su información"), shaped { data: Transaction }.
 * - listCharges refuses: GET /transactions needs from_date/until_date and its
 *   documented 200 response has no schema ("content": {}), so neither the rows
 *   nor an end-of-list signal can be read from documented fields.
 * - listCustomers / getCustomer refuse: Wompi has no customer resource.
 * - listRefunds refuses: "GET /v1/refunds?merchant_id={merchant_id}&region=CO.
 *   Los parámetros merchant_id y region son obligatorios", and this connection
 *   stores only the private key.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { WompiAdapter } from '../../../../../../src/verticals/payments/adapters/wompi'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/wompi/client', () => ({
  WompiClient: class {
    get = getMock
    post = postMock
    delete = vi.fn()
  },
}))

const adapter = new WompiAdapter()
const CREDS: Credentials = { accessToken: 'prv_prod_lYE0crWWfzlLUN8FwiVIXoUVHyJtoAPm' }

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
})

describe('wompi getCharge', () => {
  it('reads GET /transactions/{transaction_id} and its documented { data } envelope', async () => {
    getMock.mockImplementation(async (path: string, params?: unknown) => {
      if (path !== '/transactions/1292-1602113476-10985' || params !== undefined) {
        throw Object.assign(new Error(`undocumented request ${path}`), { statusCode: 404 })
      }
      return {
        data: {
          id: '1292-1602113476-10985',
          reference: 'ORDER-2024-001',
          status: 'APPROVED',
          amount_in_cents: 50000,
          currency: 'COP',
          payment_method_type: 'CARD',
          status_message: 'Transacción aprobada',
        },
      }
    })
    const charge = ChargeSchema.parse(await adapter.getCharge(CREDS, '1292-1602113476-10985'))
    expect(charge.id).toBe('1292-1602113476-10985')
    expect(charge.amount).toBe(50000)
    expect(charge.status).toBe('succeeded')
    expect(getMock).toHaveBeenCalledTimes(1)
  })

  it('encodes the id into the path', async () => {
    getMock.mockResolvedValue({
      data: { id: 'a/b', amount_in_cents: 1, currency: 'COP', status: 'PENDING' },
    })
    await adapter.getCharge(CREDS, 'a/b')
    expect(getMock).toHaveBeenCalledWith('/transactions/a%2Fb')
  })

  it('throws when the response carries no data object', async () => {
    getMock.mockResolvedValue({})
    await expect(adapter.getCharge(CREDS, 'x')).rejects.toThrow(/data/)
  })
})

describe('wompi refusals', () => {
  it.each([
    ['listCharges', () => adapter.listCharges(CREDS, { page: 1, limit: 50 })],
    [
      'listCharges with updatedAfter',
      () =>
        adapter.listCharges(CREDS, {
          page: 1,
          limit: 50,
          updatedAfter: new Date('2026-01-01T00:00:00Z'),
        }),
    ],
    ['listCustomers', () => adapter.listCustomers(CREDS, { page: 1, limit: 50 })],
    ['getCustomer', () => adapter.getCustomer(CREDS, 'cus_1')],
    ['listRefunds', () => adapter.listRefunds(CREDS, { page: 1, limit: 50 })],
  ] as const)('%s refuses with 501 NOT_SUPPORTED and sends no request', async (_name, run) => {
    await expect(run()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(getMock).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
  })

  it('listRefunds names the merchant_id it lacks', async () => {
    await expect(adapter.listRefunds(CREDS, { page: 1, limit: 50 })).rejects.toThrow(
      /GET \/v1\/refunds requires merchant_id/,
    )
  })

  it('listCharges names the undocumented response', async () => {
    await expect(adapter.listCharges(CREDS, { page: 1, limit: 50 })).rejects.toThrow(
      /GET \/transactions/,
    )
  })
})
