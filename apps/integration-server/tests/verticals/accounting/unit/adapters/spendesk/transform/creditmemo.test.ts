import { describe, it, expect } from 'vitest'
import {
  transformPayableAsCreditMemo,
  transformSearchPayableAsCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/spendesk/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { payable, searchPayable } from '../fixtures'

describe('transformSearchPayableAsCreditMemo (spendesk, POST /v1/payables/search)', () => {
  const raw = () =>
    searchPayable({
      kind: 'reversal',
      subType: 'creditNote',
      type: 'reverseBill',
      amount: -1500,
      outstandingAmount: -500,
      itemLines: [
        {
          netAmount: -1250,
          grossAmount: -1500,
          vatAmount: -250,
          vatAdjustment: 0,
          analyticalFieldAssociations: [],
          vatRate: 20,
        },
      ],
      documentaryEvidence: {
        type: 'creditNote',
        validity: { valid: true },
        creditNoteNumber: 'CN-42',
        referenceInvoiceNumber: 'SUPP-INV-100',
      },
    })

  it('maps a documented reversal', () => {
    expect(CreditMemoSchema.parse(transformSearchPayableAsCreditMemo(raw()))).toMatchObject({
      id: 'bc9cef35-401d-4ea4-b384-ed725e6685cf',
      creditmemoNumber: 'CN-42',
      contactId: 'sup_xyz',
      currency: 'EUR',
      totalAmount: -1500,
      balanceAmount: -500,
      postedAt: new Date('2024-06-15T10:30:00.000Z'),
      createdAt: new Date('2024-06-15T10:30:00.000Z'),
      lineItems: [{ taxAmount: -250, totalAmount: -1500 }],
    })
  })

  // creationDate is the issue date and "does NOT reflect when the record entered
  // Spendesk (see firstCreatedAt for that)": the two must not be swapped.
  it('postedAt is creationDate and createdAt is firstCreatedAt', () => {
    const r = CreditMemoSchema.parse(
      transformSearchPayableAsCreditMemo({
        ...raw(),
        ...{ creationDate: '2024-05-01T00:00:00.000Z', firstCreatedAt: '2024-06-15T10:30:00.000Z' },
      }),
    )
    expect(r.postedAt).toEqual(new Date('2024-05-01T00:00:00.000Z'))
    expect(r.createdAt).toEqual(new Date('2024-06-15T10:30:00.000Z'))
  })
})

describe('transformPayableAsCreditMemo (spendesk, GET /v1/payables/{id})', () => {
  it('maps the documented fields and no status', () => {
    const raw = payable({
      type: 'creditNote',
      amount: -1500,
      outstandingAmount: 0,
      invoiceNumber: null,
      creditNoteNumber: 'CN-42',
      bookkeepingStatus: 'exported',
    })
    const out = CreditMemoSchema.parse(transformPayableAsCreditMemo(raw))
    expect(out).toMatchObject({
      id: 'bc9cef35-401d-4ea4-b384-ed725e6685cf',
      creditmemoNumber: 'CN-42',
      contactId: 'sup_xyz',
      currency: 'EUR',
      totalAmount: -1500,
      balanceAmount: 0,
      postedAt: new Date('2024-06-15T00:00:00.000Z'),
      createdAt: new Date('2024-06-15T10:30:00.000Z'),
    })
    expect(out.status).toBeUndefined()
  })
})
