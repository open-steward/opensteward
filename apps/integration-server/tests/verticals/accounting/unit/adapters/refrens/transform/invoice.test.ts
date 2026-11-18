import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type RefrensInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/refrens/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<RefrensInvoice> = {}): RefrensInvoice {
  return {
    _id: 'inv_001',
    invoiceNumber: 'INV-001',
    invoiceDate: '2024-03-01',
    dueDate: '2024-03-31',
    currency: 'INR',
    status: 'UNPAID',
    billedTo: {
      name: 'Acme Corp',
      email: 'billing@acme.in',
      phone: '+91-9000000001',
      gstin: '22AAAAA0000A1Z5',
    },
    items: [
      {
        name: 'Consulting Services',
        rate: 10000,
        quantity: 1,
        igst: 1800,
        cgst: 0,
        sgst: 0,
        taxRate: 18,
        total: 11800,
      },
    ],
    finalTotal: {
      total: 11800,
      igst: 1800,
      cgst: 0,
      sgst: 0,
      subTotal: 10000,
    },
    share: {
      link: 'https://refrens.com/inv/inv_001',
      pdf: 'https://refrens.com/inv/inv_001.pdf',
    },
    createdAt: '2024-02-28T08:00:00.000Z',
    updatedAt: '2024-03-01T09:00:00.000Z',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps _id to id', () => {
    const result = transformInvoice(makeInvoice({ _id: 'inv_xyz' }))
    expect(result.id).toBe('inv_xyz')
  })

  it('always sets type to INVOICE', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.type).toBe('INVOICE')
  })

  it('maps invoiceNumber', () => {
    const result = transformInvoice(makeInvoice({ invoiceNumber: 'INV-999' }))
    expect(result.invoiceNumber).toBe('INV-999')
  })

  it('maps currency', () => {
    const result = transformInvoice(makeInvoice({ currency: 'USD' }))
    expect(result.currency).toBe('USD')
  })

  it('maps finalTotal.total to totalAmount', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.totalAmount).toBe(11800)
  })

  it('sums igst+cgst+sgst from finalTotal for taxAmount', () => {
    const result = transformInvoice(
      makeInvoice({ finalTotal: { total: 12400, igst: 900, cgst: 450, sgst: 450 } }),
    )
    expect(result.taxAmount).toBe(1800)
  })

  it('maps share.link to url', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.url).toBe('https://refrens.com/inv/inv_001')
  })

  it('returns undefined url when share is absent', () => {
    const result = transformInvoice(makeInvoice({ share: undefined }))
    expect(result.url).toBeUndefined()
  })

  it('parses invoiceDate as postedAt Date', () => {
    const result = transformInvoice(makeInvoice({ invoiceDate: '2024-03-01' }))
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses dueDate as dueAt Date', () => {
    const result = transformInvoice(makeInvoice({ dueDate: '2024-03-31' }))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('parses createdAt and updatedAt as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.createdAt).toEqual(new Date('2024-02-28T08:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-03-01T09:00:00.000Z'))
  })

  it('maps line items correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Consulting Services')
    expect(li.unitAmount).toBe(10000)
    expect(li.unitQuantity).toBe(1)
    expect(li.totalAmount).toBe(11800)
    expect(li.taxAmount).toBe(1800)
  })

  it('assigns sequential ids to multiple line items', () => {
    const raw = makeInvoice({
      items: [
        { name: 'Item A', rate: 100, quantity: 1, total: 100 },
        { name: 'Item B', rate: 200, quantity: 2, total: 400 },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![1].id).toBe('2')
  })

  it('handles missing items with empty lineItems array', () => {
    const result = transformInvoice(makeInvoice({ items: undefined }))
    expect(result.lineItems).toEqual([])
  })

  it('passes raw object through as metadata (reference equality)', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces output that satisfies InvoiceSchema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  describe('status mapping', () => {
    it('maps UNPAID to AUTHORIZED', () => {
      expect(transformInvoice(makeInvoice({ status: 'UNPAID' })).status).toBe('AUTHORIZED')
    })

    it('maps PAID to PAID', () => {
      expect(transformInvoice(makeInvoice({ status: 'PAID' })).status).toBe('PAID')
    })

    it('maps PARTIALLY_PAID to PARTIALLY_PAID', () => {
      expect(transformInvoice(makeInvoice({ status: 'PARTIALLY_PAID' })).status).toBe(
        'PARTIALLY_PAID',
      )
    })

    it('maps CANCELED to VOIDED', () => {
      expect(transformInvoice(makeInvoice({ status: 'CANCELED' })).status).toBe('VOIDED')
    })

    it('maps CANCELLED (alternative spelling) to VOIDED', () => {
      expect(transformInvoice(makeInvoice({ status: 'CANCELLED' })).status).toBe('VOIDED')
    })

    it('maps unknown/missing status to DRAFT', () => {
      expect(transformInvoice(makeInvoice({ status: undefined })).status).toBe('DRAFT')
    })

    it('maps empty string status to DRAFT', () => {
      expect(transformInvoice(makeInvoice({ status: '' })).status).toBe('DRAFT')
    })
  })
})

describe('untransformInvoice', () => {
  it('maps invoiceNumber', () => {
    const result = untransformInvoice({ invoiceNumber: 'INV-42' })
    expect(result.invoiceNumber).toBe('INV-42')
  })

  it('maps currency', () => {
    const result = untransformInvoice({ currency: 'INR' })
    expect(result.currency).toBe('INR')
  })

  it('maps postedAt to invoiceDate as YYYY-MM-DD string', () => {
    const result = untransformInvoice({ postedAt: new Date('2024-05-20T00:00:00.000Z') })
    expect(result.invoiceDate).toBe('2024-05-20')
  })

  it('maps dueAt to dueDate as YYYY-MM-DD string', () => {
    const result = untransformInvoice({ dueAt: new Date('2024-06-20T00:00:00.000Z') })
    expect(result.dueDate).toBe('2024-06-20')
  })

  it('maps lineItems to items with name/rate/quantity', () => {
    const result = untransformInvoice({
      lineItems: [{ id: '1', itemDescription: 'Service', unitAmount: 500, unitQuantity: 4 }],
    })
    expect(Array.isArray(result.items)).toBe(true)
    const item = (result.items as unknown[])[0] as Record<string, unknown>
    expect(item.name).toBe('Service')
    expect(item.rate).toBe(500)
    expect(item.quantity).toBe(4)
  })

  it('defaults lineitem quantity to 1 when unitQuantity is absent', () => {
    const result = untransformInvoice({
      lineItems: [{ id: '1', itemDescription: 'Widget', unitAmount: 250 }],
    })
    const item = (result.items as unknown[])[0] as Record<string, unknown>
    expect(item.quantity).toBe(1)
  })

  it('round-trips through transformInvoice → untransformInvoice preserving key fields', () => {
    const raw = makeInvoice()
    const canonical = transformInvoice(raw)
    const back = untransformInvoice(canonical)
    expect(back.invoiceNumber).toBe(raw.invoiceNumber)
    expect(back.currency).toBe(raw.currency)
  })
})
