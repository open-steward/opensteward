/**
 * Fixtures follow the documented example body of GET /charges/{charge_id}
 * (https://developer.pagbank.com.br/reference/consultar-pagamento.md) and the
 * field list of https://developer.pagbank.com.br/reference/objeto-charge.md.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawPagseguroCharge,
} from '../../../../../../../src/verticals/payments/adapters/pagseguro/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

function documentedCharge(overrides: Partial<RawPagseguroCharge> = {}): RawPagseguroCharge {
  return {
    id: 'CHAR_D32A01A9-92A6-4755-B21D-7B6A1291F7AD',
    reference_id: 'ex-00001',
    status: 'AUTHORIZED',
    created_at: '2023-02-08T15:15:11.881-03:00',
    description: 'Motivo da cobrança',
    amount: { value: 1000, currency: 'BRL', summary: { total: 1000, paid: 0, refunded: 0 } },
    payment_response: { code: 20000, message: 'SUCESSO', reference: '071200027526' },
    payment_method: {
      type: 'CREDIT_CARD',
      capture: false,
      card: { id: 'CARD_CCFE8D12-79E9-4ADF-920B-A54E51D8DA6E' },
    },
    ...overrides,
  }
}

describe('pagseguro transformCharge', () => {
  it('maps the documented example body', () => {
    const result = ChargeSchema.parse(transformCharge(documentedCharge()))

    expect(result.id).toBe('CHAR_D32A01A9-92A6-4755-B21D-7B6A1291F7AD')
    expect(result.externalId).toBe('CHAR_D32A01A9-92A6-4755-B21D-7B6A1291F7AD')
    expect(result.amount).toBe(1000)
    expect(result.currency).toBe('BRL')
    expect(result.amountCaptured).toBe(0)
    expect(result.amountRefunded).toBe(0)
    expect(result.status).toBe('pending')
    expect(result.captured).toBe(false)
    expect(result.description).toBe('Motivo da cobrança')
    expect(result.paymentMethodId).toBe('CARD_CCFE8D12-79E9-4ADF-920B-A54E51D8DA6E')
    expect(result.createdAt).toBe('2023-02-08T18:15:11.881Z')
    expect(result.failureCode).toBeUndefined()
    expect(result.customerId).toBeUndefined()
    expect(result.gateway).toBe('pagseguro')
  })

  it('maps a paid charge with its capture time', () => {
    const result = ChargeSchema.parse(
      transformCharge(
        documentedCharge({
          status: 'PAID',
          paid_at: '2023-02-08T15:15:12.000-03:00',
          amount: {
            value: 150099,
            currency: 'BRL',
            summary: { total: 150099, paid: 150099, refunded: 0 },
          },
        }),
      ),
    )
    expect(result.status).toBe('succeeded')
    expect(result.captured).toBe(true)
    expect(result.amount).toBe(150099)
    expect(result.amountCaptured).toBe(150099)
    expect(result.capturedAt).toBe('2023-02-08T18:15:12.000Z')
  })

  it.each([
    ['IN_ANALYSIS', 'pending'],
    ['WAITING', 'pending'],
    ['CANCELED', 'cancelled'],
    ['SOMETHING_NEW', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    expect(ChargeSchema.parse(transformCharge(documentedCharge({ status }))).status).toBe(expected)
  })

  it('reports the provider response as the failure of a declined charge', () => {
    const result = ChargeSchema.parse(
      transformCharge(
        documentedCharge({
          status: 'DECLINED',
          payment_response: { code: 10002, message: 'NAO AUTORIZADO', reference: '1' },
        }),
      ),
    )
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('10002')
    expect(result.failureMessage).toBe('NAO AUTORIZADO')
  })

  it('derives refunded and partially_refunded from amount.summary', () => {
    const partial = transformCharge(
      documentedCharge({
        status: 'PAID',
        amount: {
          value: 1000,
          currency: 'BRL',
          summary: { total: 1000, paid: 1000, refunded: 400 },
        },
      }),
    )
    expect(ChargeSchema.parse(partial).status).toBe('partially_refunded')
    expect(partial.amountRefunded).toBe(400)

    const full = transformCharge(
      documentedCharge({
        status: 'CANCELED',
        amount: {
          value: 1000,
          currency: 'BRL',
          summary: { total: 1000, paid: 1000, refunded: 1000 },
        },
      }),
    )
    expect(ChargeSchema.parse(full).status).toBe('refunded')
  })

  it('throws instead of inventing an amount or currency', () => {
    expect(() => transformCharge(documentedCharge({ amount: { currency: 'BRL' } }))).toThrow(
      /amount\.value/,
    )
    expect(() => transformCharge(documentedCharge({ amount: { value: 1000 } }))).toThrow(
      /amount\.currency/,
    )
    expect(() => transformCharge(documentedCharge({ amount: null }))).toThrow(/amount\.value/)
  })
})
