import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import {
  transformInvoice,
  untransformInvoice,
  type WhitebooksIrnResponse,
} from '../../../../../../../src/verticals/accounting/adapters/whitebooks/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeRaw(overrides: Partial<WhitebooksIrnResponse> = {}): WhitebooksIrnResponse {
  return {
    Irn: 'abc123irn',
    AckNo: 'ACK001',
    AckDt: '2026-02-01 10:00:00',
    DocDtls: { Typ: 'INV', No: 'INV-001', Dt: '01/02/2026' },
    ValDtls: {
      AssVal: 1000,
      IgstVal: 180,
      CgstVal: 0,
      SgstVal: 0,
      TotInvVal: 1180,
    },
    BuyerDtls: { Gstin: '29AABCU9603R1ZM', LglNm: 'Buyer Co' },
    ItemList: [
      {
        SlNo: '1',
        PrdDesc: 'Widget',
        HsnCd: '8471',
        Qty: 2,
        UnitPrice: 500,
        TotAmt: 1000,
        TotItemVal: 1180,
        IgstAmt: 180,
        CgstAmt: 0,
        SgstAmt: 0,
      },
    ],
    ...overrides,
  }
}

describe('transformInvoice (whitebooks)', () => {
  it('maps Irn to id', () => {
    expect(transformInvoice(makeRaw()).id).toBe('abc123irn')
  })

  it('maps DocDtls.No to invoiceNumber', () => {
    // id uses Irn first; invoiceNumber uses DocDtls.No first
    expect(transformInvoice(makeRaw()).invoiceNumber).toBe('INV-001')
  })

  it('maps BuyerDtls.Gstin to contactId', () => {
    expect(transformInvoice(makeRaw()).contactId).toBe('29AABCU9603R1ZM')
  })

  it('sets currency to INR', () => {
    expect(transformInvoice(makeRaw()).currency).toBe('INR')
  })

  it('converts TotInvVal from full INR to paise (×100)', () => {
    // 1180 INR → 118000 paise
    expect(transformInvoice(makeRaw()).totalAmount).toBe(118000)
  })

  it('sums IgstVal + CgstVal + SgstVal into taxAmount in paise', () => {
    // 180 INR → 18000 paise
    expect(transformInvoice(makeRaw()).taxAmount).toBe(18000)
  })

  it('sets status AUTHORIZED when Irn present and not cancelled', () => {
    expect(transformInvoice(makeRaw()).status).toBe('AUTHORIZED')
  })

  it('sets status VOIDED when CancelDate is set', () => {
    expect(transformInvoice(makeRaw({ CancelDate: '05/02/2026' })).status).toBe('VOIDED')
  })

  it('sets status DRAFT when Irn absent', () => {
    expect(transformInvoice(makeRaw({ Irn: undefined })).status).toBe('DRAFT')
  })

  it('maps DocDtls.Typ CRN to type CREDITMEMO', () => {
    const raw = makeRaw()
    raw.DocDtls!.Typ = 'CRN'
    expect(transformInvoice(raw).type).toBe('CREDITMEMO')
  })

  it('maps DocDtls.Dt DD/MM/YYYY to postedAt', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString()).toBe('2026-02-01T00:00:00.000Z')
  })

  it('maps line item UnitPrice to unitAmount in paise', () => {
    const li = transformInvoice(makeRaw()).lineItems?.[0]
    // 500 INR → 50000 paise
    expect(li?.unitAmount).toBe(50000)
  })

  it('maps line item HSN code to itemSku', () => {
    const li = transformInvoice(makeRaw()).lineItems?.[0]
    expect(li?.itemSku).toBe('8471')
  })

  it('produces a schema-valid Invoice', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeRaw()))).not.toThrow()
  })

  describe('untransformInvoice', () => {
    it('sets DocDtls.Typ to INV for INVOICE type', () => {
      const result = untransformInvoice({ type: 'INVOICE', invoiceNumber: 'INV-001' })
      expect((result.DocDtls as Record<string, unknown>)?.Typ).toBe('INV')
    })

    it('sets DocDtls.Typ to CRN for CREDITMEMO type', () => {
      const result = untransformInvoice({ type: 'CREDITMEMO', invoiceNumber: 'CRN-001' })
      expect((result.DocDtls as Record<string, unknown>)?.Typ).toBe('CRN')
    })

    it('converts paise totalAmount back to INR', () => {
      const result = untransformInvoice({ totalAmount: 118000 })
      // 118000 paise → 1180 INR
      expect((result.ValDtls as Record<string, unknown>)?.TotInvVal).toBe(1180)
    })

    it('formats postedAt as DD/MM/YYYY in DocDtls.Dt', () => {
      const result = untransformInvoice({ postedAt: new Date('2026-02-01T00:00:00Z') })
      expect((result.DocDtls as Record<string, unknown>)?.Dt).toBe('01/02/2026')
    })
  })
})
