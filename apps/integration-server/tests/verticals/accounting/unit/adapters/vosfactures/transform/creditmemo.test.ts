import { describe, it, expect } from 'vitest'
import {
  isRevenueCorrection,
  transformCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/vosfactures/transform/creditmemo'
import type { VosFacturesInvoice } from '../../../../../../../src/verticals/accounting/adapters/vosfactures/transform/invoice'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeCorrection(overrides: Partial<VosFacturesInvoice> = {}): VosFacturesInvoice {
  return {
    id: 2002,
    number: 'FK/2024/002',
    kind: 'correction',
    status: 'issued',
    income: '1',
    issue_date: '2024-05-15',
    payment_to: '2024-06-15',
    currency: 'PLN',
    price_gross: '615.00',
    price_net: '500.00',
    price_tax: '115.00',
    paid: '0',
    client_id: 75,
    description: 'Return of goods',
    correction_reason: 'Defective product',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCorrection())
    expect(result.id).toBe('2002')
    expect(result.creditmemoNumber).toBe('FK/2024/002')
    expect(result.contactId).toBe('75')
    expect(result.currency).toBe('PLN')
  })

  describe('amounts (minor units, credit read as positive)', () => {
    it('reads price_gross, price_tax and paid in minor units of the currency', () => {
      const result = CreditMemoSchema.parse(
        transformCreditMemo(
          makeCorrection({ price_gross: '615.45', price_tax: '115.09', paid: '15.45' }),
        ),
      )
      expect(result.totalAmount).toBe(61545)
      expect(result.taxAmount).toBe(11509)
      expect(result.paidAmount).toBe(1545)
      expect(result.balanceAmount).toBe(60000)
    })

    it('reports a negative note as magnitudes', () => {
      const result = CreditMemoSchema.parse(
        transformCreditMemo(
          makeCorrection({ price_gross: '-10,00', price_tax: '-1,87', paid: '0,00' }),
        ),
      )
      expect(result.totalAmount).toBe(1000)
      expect(result.taxAmount).toBe(187)
      expect(result.paidAmount).toBe(0)
      expect(result.balanceAmount).toBe(1000)
    })

    it('scales by the currency exponent (JPY 0, KWD 3)', () => {
      expect(
        CreditMemoSchema.parse(
          transformCreditMemo(makeCorrection({ currency: 'JPY', price_gross: '-615' })),
        ).totalAmount,
      ).toBe(615)
      expect(
        CreditMemoSchema.parse(
          transformCreditMemo(makeCorrection({ currency: 'KWD', price_gross: '-6.155' })),
        ).totalAmount,
      ).toBe(6155)
    })

    it("normalises the README's negative correction line to a positive credit", () => {
      // README "Créer une facture d'avoir (partielle)": quantity -1, total_price_gross "-10".
      const result = CreditMemoSchema.parse(
        transformCreditMemo(
          makeCorrection({
            currency: 'EUR',
            price_gross: '-10',
            positions: [
              {
                name: 'Produit A1',
                quantity: -1,
                price_net: '-8.13',
                total_price_net: '-8.13',
                total_price_gross: '-10',
                tax: '23',
                kind: 'correction',
              },
            ],
          }),
        ),
      )
      expect(result.lineItems).toEqual([
        expect.objectContaining({
          itemName: 'Produit A1',
          unitQuantity: 1,
          unitAmount: 813,
          totalAmount: 1000,
          taxAmount: 187,
        }),
      ])
    })

    it('keeps a line of the opposite sign opposite, so lines sum to the header', () => {
      const result = CreditMemoSchema.parse(
        transformCreditMemo(
          makeCorrection({
            currency: 'EUR',
            price_gross: '-90',
            price_tax: undefined,
            positions: [
              { name: 'Return', quantity: -1, price_gross: '-100', total_price_gross: '-100' },
              { name: 'Restocking fee', quantity: 1, price_net: '10', total_price_gross: '10' },
            ],
          }),
        ),
      )
      expect(result.totalAmount).toBe(9000)
      expect(result.lineItems!.map((l) => l.totalAmount)).toEqual([10000, -1000])
      expect(result.lineItems![1].unitAmount).toBe(-1000)
    })

    it('takes the sign from the lines when the header total is absent', () => {
      const result = CreditMemoSchema.parse(
        transformCreditMemo(
          makeCorrection({
            price_gross: undefined,
            positions: [{ name: 'A', quantity: -2, total_price_gross: '-20' }],
          }),
        ),
      )
      expect(result.totalAmount).toBeUndefined()
      expect(result.lineItems![0].totalAmount).toBe(2000)
      expect(result.lineItems![0].unitQuantity).toBe(2)
    })

    it('leaves a fractional quantity out rather than rounding it', () => {
      const result = CreditMemoSchema.parse(
        transformCreditMemo(
          makeCorrection({
            positions: [{ name: 'Flour', quantity: '-1.5', total_price_gross: '-3' }],
          }),
        ),
      )
      expect(result.lineItems![0].unitQuantity).toBeUndefined()
    })
  })

  describe('isRevenueCorrection', () => {
    it('is true only for kind "correction" on the revenue side', () => {
      expect(isRevenueCorrection(makeCorrection())).toBe(true)
      expect(isRevenueCorrection(makeCorrection({ income: 1 }))).toBe(true)
      expect(isRevenueCorrection(makeCorrection({ income: 'true' }))).toBe(true)
      expect(isRevenueCorrection(makeCorrection({ income: '0' }))).toBe(false)
      expect(isRevenueCorrection(makeCorrection({ income: undefined }))).toBe(false)
      expect(isRevenueCorrection(makeCorrection({ kind: 'vat' }))).toBe(false)
      expect(isRevenueCorrection(makeCorrection({ kind: 'estimate' }))).toBe(false)
      expect(isRevenueCorrection(null)).toBe(false)
    })
  })

  it('maps correction_reason to notes', () => {
    const result = transformCreditMemo(makeCorrection({ correction_reason: 'Defective product' }))
    expect(result.notes).toBe('Defective product')
  })

  it('falls back to description when correction_reason absent', () => {
    const result = transformCreditMemo(
      makeCorrection({ correction_reason: undefined, description: 'Return' }),
    )
    expect(result.notes).toBe('Return')
  })

  it('maps status issued to DRAFT', () => {
    const result = transformCreditMemo(makeCorrection({ status: 'issued' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status paid to PAID', () => {
    const result = transformCreditMemo(makeCorrection({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps status rejected to VOIDED', () => {
    const result = transformCreditMemo(makeCorrection({ status: 'rejected' }))
    expect(result.status).toBe('VOIDED')
  })

  it('parses dates as Date objects', () => {
    const result = transformCreditMemo(makeCorrection())
    expect(result.postedAt).toEqual(new Date('2024-05-15'))
    expect(result.dueAt).toEqual(new Date('2024-06-15'))
  })

  it('passes raw as metadata', () => {
    const raw = makeCorrection()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformCreditMemo(makeCorrection())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })

  describe('appliedTo (invoice_id, the functionally linked reference invoice)', () => {
    it('links a revenue correction to the invoice named by invoice_id', () => {
      const result = CreditMemoSchema.parse(
        transformCreditMemo(makeCorrection({ invoice_id: 2432393 })),
      )
      expect(result.appliedTo).toEqual([{ invoiceId: '2432393' }])
    })

    it('accepts invoice_id as a string, as the README example sends it', () => {
      const result = CreditMemoSchema.parse(
        transformCreditMemo(makeCorrection({ invoice_id: '2432393', income: 'true' })),
      )
      expect(result.appliedTo).toEqual([{ invoiceId: '2432393' }])
    })

    it('is absent when invoice_id is missing, null, empty or 0', () => {
      for (const invoice_id of [undefined, null, '', 0, '0']) {
        const result = CreditMemoSchema.parse(transformCreditMemo(makeCorrection({ invoice_id })))
        expect(result.appliedTo).toBeUndefined()
      }
    })

    it('ignores from_invoice_id, which creates no functional link', () => {
      const result = CreditMemoSchema.parse(
        transformCreditMemo(makeCorrection({ from_invoice_id: 2432393 })),
      )
      expect(result.appliedTo).toBeUndefined()
    })

    it('is absent on an expense-side correction, whose reference is a Bill', () => {
      const result = CreditMemoSchema.parse(
        transformCreditMemo(makeCorrection({ income: '0', invoice_id: 2432393 })),
      )
      expect(result.appliedTo).toBeUndefined()
    })

    it('is absent when income is missing and the side is unknown', () => {
      const result = CreditMemoSchema.parse(
        transformCreditMemo(makeCorrection({ income: undefined, invoice_id: 2432393 })),
      )
      expect(result.appliedTo).toBeUndefined()
    })
  })
})
