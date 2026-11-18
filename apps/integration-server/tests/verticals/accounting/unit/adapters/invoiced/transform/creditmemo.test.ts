import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type InvoicedCreditNote,
  type InvoicedCreditNoteLineItem,
} from '../../../../../../../src/verticals/accounting/adapters/invoiced/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeLineItem(
  overrides: Partial<InvoicedCreditNoteLineItem> = {},
): InvoicedCreditNoteLineItem {
  return {
    id: 101,
    catalog_item: 'item-sku-1',
    name: 'Widget A',
    description: 'Blue widget',
    quantity: 2,
    unit_cost: 5000,
    amount: 10000,
    ...overrides,
  }
}

function makeCreditNote(overrides: Partial<InvoicedCreditNote> = {}): InvoicedCreditNote {
  return {
    id: 3010,
    object: 'credit_note',
    customer: 99,
    number: 'CM-3010',
    status: 'open',
    draft: false,
    closed: false,
    paid: false,
    currency: 'usd',
    date: 1700000000,
    items: [makeLineItem()],
    total: 10000,
    balance: 10000,
    notes: 'Credit for over-billing.',
    url: 'https://app.example.com/credit-notes/CM-3010',
    metadata: {},
    created_at: 1700000000,
    updated_at: 1700100000,
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('converts numeric id to string', () => {
    expect(transformCreditMemo(makeCreditNote({ id: 3010 })).id).toBe('3010')
  })

  it('uses number field as creditmemoNumber when present', () => {
    expect(transformCreditMemo(makeCreditNote({ number: 'CM-3010' })).creditmemoNumber).toBe(
      'CM-3010',
    )
  })

  it('falls back to String(id) for creditmemoNumber when number is null', () => {
    const result = transformCreditMemo(makeCreditNote({ id: 3010, number: null }))
    expect(result.creditmemoNumber).toBe('3010')
  })

  it('converts customer number to contactId string', () => {
    expect(transformCreditMemo(makeCreditNote({ customer: 99 })).contactId).toBe('99')
  })

  it('uppercases currency', () => {
    expect(transformCreditMemo(makeCreditNote({ currency: 'usd' })).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformCreditMemo(makeCreditNote({ total: 10000 })).totalAmount).toBe(10000)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformCreditMemo(makeCreditNote({ balance: 5000 })).balanceAmount).toBe(5000)
  })

  it('maps url', () => {
    const url = 'https://app.example.com/credit-notes/CM-3010'
    expect(transformCreditMemo(makeCreditNote({ url })).url).toBe(url)
  })

  it('maps notes', () => {
    expect(transformCreditMemo(makeCreditNote({ notes: 'Credit for over-billing.' })).notes).toBe(
      'Credit for over-billing.',
    )
  })

  it('converts epoch date to postedAt', () => {
    const result = transformCreditMemo(makeCreditNote({ date: 1700000000 }))
    expect(result.postedAt).toEqual(new Date(1700000000 * 1000))
  })

  it('sets postedAt to undefined when date is null', () => {
    expect(transformCreditMemo(makeCreditNote({ date: null })).postedAt).toBeUndefined()
  })

  it('converts epoch seconds to Date for createdAt and updatedAt', () => {
    const result = transformCreditMemo(
      makeCreditNote({ created_at: 1700000000, updated_at: 1700100000 }),
    )
    expect(result.createdAt).toEqual(new Date(1700000000 * 1000))
    expect(result.updatedAt).toEqual(new Date(1700100000 * 1000))
  })

  describe('status mapping', () => {
    it('maps voided → VOIDED', () => {
      expect(transformCreditMemo(makeCreditNote({ status: 'voided' })).status).toBe('VOIDED')
    })

    it('maps paid → PAID', () => {
      expect(transformCreditMemo(makeCreditNote({ status: 'paid' })).status).toBe('PAID')
    })

    it('maps draft → DRAFT', () => {
      expect(transformCreditMemo(makeCreditNote({ status: 'draft' })).status).toBe('DRAFT')
    })

    it('maps open → AUTHORIZED', () => {
      expect(transformCreditMemo(makeCreditNote({ status: 'open' })).status).toBe('AUTHORIZED')
    })

    it('maps closed → AUTHORIZED', () => {
      expect(transformCreditMemo(makeCreditNote({ status: 'closed' })).status).toBe('AUTHORIZED')
    })
  })

  describe('line items', () => {
    it('maps line item id, name, and amounts', () => {
      const result = transformCreditMemo(makeCreditNote())
      const li = result.lineItems?.[0]
      expect(li?.id).toBe('101')
      expect(li?.itemName).toBe('Widget A')
      expect(li?.unitAmount).toBe(5000)
      expect(li?.unitQuantity).toBe(2)
      expect(li?.totalAmount).toBe(10000)
    })

    it('maps catalog_item to itemId', () => {
      const result = transformCreditMemo(makeCreditNote())
      expect(result.lineItems?.[0]?.itemId).toBe('item-sku-1')
    })

    it('maps description to itemDescription', () => {
      const result = transformCreditMemo(makeCreditNote())
      expect(result.lineItems?.[0]?.itemDescription).toBe('Blue widget')
    })

    it('omits itemId when catalog_item is null', () => {
      const result = transformCreditMemo(
        makeCreditNote({ items: [makeLineItem({ catalog_item: null })] }),
      )
      expect(result.lineItems?.[0]?.itemId).toBeUndefined()
    })

    it('produces empty lineItems array when items is empty', () => {
      const result = transformCreditMemo(makeCreditNote({ items: [] }))
      expect(result.lineItems).toEqual([])
    })
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditNote()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('passes CreditMemoSchema validation', () => {
    const result = transformCreditMemo(makeCreditNote())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
