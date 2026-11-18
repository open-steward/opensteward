/**
 * Account Transactions row → canonical Payout.
 *
 * Fixture: the documented example of `account_transactions_200` in the Payment
 * API spec (https://developer.viva.com/downloads/payment-api.yaml), with
 * `subTypeId` set to a payout subtype from Viva's SubTypeId table
 * (https://developer.viva.com/webhooks-for-payments/account-transaction-created/#subtype-ids-of-transactions):
 * "30 PayOutIban This is a debit transaction equal to the amount of money a
 * customer sent from their account to an IBAN account." / "31 PayOutCard".
 */
import { describe, it, expect } from 'vitest'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'
import { transformPayout } from '../../../../../../../src/verticals/payments/adapters/viva-com/transform/payout'
import { documentedAccountTransaction } from '../fixture'

describe('transformPayout (Viva.com account transaction)', () => {
  it('maps the documented example row to a schema-valid payout', () => {
    const raw = documentedAccountTransaction({ subTypeId: 30 })
    const payout = PayoutSchema.parse(transformPayout(raw))
    expect(payout).toMatchObject({
      id: '2353af54-b897-4ac3-93b0-f374ab643572',
      externalId: '2353af54-b897-4ac3-93b0-f374ab643572',
      amount: 520,
      currency: 'EUR',
      status: 'unknown',
      gateway: 'viva-com',
      metadata: { walletId: '211878332234', subType: 'PayOutIban' },
      createdAt: '2023-06-06T11:21:09.487Z',
    })
    expect(payout.raw).toBe(raw)
    expect(payout.method).toBeUndefined()
    expect(payout.arrivalDate).toBeUndefined()
  })

  it('reports the magnitude of a signed (debit) amount', () => {
    // Webhook field table: "Amount The signed amount of the transaction … -100.4".
    const payout = transformPayout(documentedAccountTransaction({ subTypeId: 31, amount: -100.4 }))
    expect(payout.amount).toBe(10040)
    expect(payout.metadata.subType).toBe('PayOutCard')
  })

  it('throws on a currency code Viva does not document', () => {
    expect(() =>
      transformPayout(documentedAccountTransaction({ subTypeId: 30, currencyCode: 840 })),
    ).toThrow(/currencyCode 840/)
  })

  it('throws on a row with no amount', () => {
    expect(() =>
      transformPayout(documentedAccountTransaction({ subTypeId: 30, amount: null })),
    ).toThrow(/no amount/)
  })

  it('throws on a row that is not a payout subtype', () => {
    // 22 PayInCard: "a credit transaction equal to the top-up amount".
    expect(() => transformPayout(documentedAccountTransaction({ subTypeId: 22 }))).toThrow(
      /subTypeId 22/,
    )
  })
})
