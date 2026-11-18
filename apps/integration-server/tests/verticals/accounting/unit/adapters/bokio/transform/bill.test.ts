import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  untransformBill,
  type BokioSupplierInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/bokio/transform/bill'
import {
  LIVE_SUPPLIER_INVOICE_A,
  LIVE_SUPPLIER_INVOICE_B,
  LIVE_SUPPLIER_INVOICE_C,
  SUPPLIER_INVOICE,
  SUPPLIER_INVOICES_PAGE,
  copyOf,
} from '../fixtures'

const bill = (overrides: Partial<BokioSupplierInvoice> = {}): BokioSupplierInvoice => ({
  ...copyOf<BokioSupplierInvoice>(SUPPLIER_INVOICE),
  ...overrides,
})

describe('transformBill (Bokio [Preview] supplier invoice)', () => {
  it('maps the documented example and parses against BillSchema', () => {
    const out = BillSchema.parse(transformBill(bill()))
    expect(out).toEqual({
      id: '6f6b2f17-3c4a-4a69-9f2d-3f5d7e1b8c90',
      // remainingAmount 1000 of totalAmount 1000: nothing paid yet
      status: 'AUTHORIZED',
      billNumber: 'INV-001',
      contactId: '6f6b2f17-3c4a-4a69-9f2d-3f5d7e1b8c90',
      currency: 'SEK',
      // 1000 SEK, major units → öre
      totalAmount: 100_000,
      // totalAmount − Σ line net = 100000 − 10 × 10000. The documented example
      // disagrees with the live data (see LIVE_SUPPLIER_INVOICE_*): read with
      // tax-exclusive lines, as live Bokio sends them, it declares no VAT on
      // the header while its line's taxRate 25 says 250 SEK.
      taxAmount: 0,
      balanceAmount: 100_000,
      lineAmountsIncludeTax: false,
      lineItems: [
        {
          id: 'a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
          itemDescription: 'Consulting',
          unitAmount: 10_000,
          unitQuantity: 10,
          // 10 × 100 SEK × 25 %
          taxAmount: 25_000,
          // net, tax-exclusive under lineAmountsIncludeTax: false
          totalAmount: 100_000,
        },
      ],
      // uploadRefs, with no company id to build the download link from
      attachments: [{ id: '24f3b7c1-8d6a-4e2f-9b31-5d7c2a8e4f90' }],
      postedAt: '2023-10-01',
      dueAt: '2023-10-15',
      metadata: SUPPLIER_INVOICE,
    })
  })

  it('maps both rows of the documented list example', () => {
    const rows = copyOf<{ items: BokioSupplierInvoice[] }>(SUPPLIER_INVOICES_PAGE).items
    const out = rows.map((r) => BillSchema.parse(transformBill(r)))
    expect(out.map((b) => [b.billNumber, b.status, b.totalAmount, b.balanceAmount])).toEqual([
      ['INV-001', 'AUTHORIZED', 100_000, 100_000],
      // remainingAmount 500 of 2500
      ['INV-002', 'PARTIALLY_PAID', 250_000, 50_000],
    ])
    expect(out[1]!.contactId).toBe('2d8ce6b4-1f3a-46a5-8a9d-5b7f2c4e9d10')
  })

  describe('status, derived from remainingAmount (Bokio documents no status)', () => {
    it('remainingAmount 0 is PAID', () => {
      const out = BillSchema.parse(transformBill(bill({ remainingAmount: 0 })))
      expect(out.status).toBe('PAID')
      expect(out.balanceAmount).toBe(0)
    })

    it('0 < remainingAmount < totalAmount is PARTIALLY_PAID', () => {
      const out = BillSchema.parse(transformBill(bill({ remainingAmount: 250.5 })))
      expect(out.status).toBe('PARTIALLY_PAID')
      expect(out.balanceAmount).toBe(25_050)
    })

    it('remainingAmount equal to totalAmount is AUTHORIZED, the open status', () => {
      expect(transformBill(bill({ remainingAmount: 1000 })).status).toBe('AUTHORIZED')
    })

    it('is never OVERDUE, even long past dueDate: that needs the clock', () => {
      const out = transformBill(bill({ dueDate: '2000-01-01', remainingAmount: 1000 }))
      expect(out.status).toBe('AUTHORIZED')
    })

    it('a remainingAmount above totalAmount stays AUTHORIZED', () => {
      expect(transformBill(bill({ remainingAmount: 1500 })).status).toBe('AUTHORIZED')
    })

    it('a negative remainingAmount on a positive total stays AUTHORIZED (sign mismatch)', () => {
      expect(transformBill(bill({ remainingAmount: -100 })).status).toBe('AUTHORIZED')
    })

    it('is unset when remainingAmount is missing, rather than guessed open', () => {
      const raw = bill()
      delete raw.remainingAmount
      const out = BillSchema.parse(transformBill(raw))
      expect(out.status).toBeUndefined()
      expect(out.balanceAmount).toBeUndefined()
    })
  })

  it('takes contactId from supplierRef.id', () => {
    const out = transformBill(bill({ supplierRef: { id: 'sup-uuid', name: 'X' } }))
    expect(out.contactId).toBe('sup-uuid')
  })

  it('leaves a fractional quantity unset instead of failing the integer schema', () => {
    const raw = bill()
    raw.lineItems = [{ ...raw.lineItems![0]!, quantity: 1.5 }]
    const out = BillSchema.parse(transformBill(raw))
    expect(out.lineItems?.[0]?.unitQuantity).toBeUndefined()
    expect(out.lineItems?.[0]?.unitAmount).toBe(10_000)
  })

  it('keeps lineItems unset (not []) when the row carries none', () => {
    const raw = bill()
    delete raw.lineItems
    expect(BillSchema.parse(transformBill(raw)).lineItems).toBeUndefined()
  })

  it('scales by the currency: a zero-decimal currency is not multiplied by 100', () => {
    const out = BillSchema.parse(transformBill(bill({ currency: 'JPY', totalAmount: 1000 })))
    expect(out.totalAmount).toBe(1000)
  })
})

describe('bill VAT: tax-exclusive lines, VAT-inclusive totalAmount (observed on live data, 2026-09-29)', () => {
  it.each([
    // [fixture, per-line net, per-line tax, header total, header tax]
    ['A', LIVE_SUPPLIER_INVOICE_A, [40_000, 160_000], [10_000, 40_000], 250_000, 50_000],
    ['B', LIVE_SUPPLIER_INVOICE_B, [80_000, 240_000], [20_000, 60_000], 400_000, 80_000],
    ['C', LIVE_SUPPLIER_INVOICE_C, [320_000, 120_000], [80_000, 30_000], 550_000, 110_000],
  ] as const)(
    'live invoice %s: line and header VAT reconcile to totalAmount',
    (_name, fixture, nets, taxes, total, headerTax) => {
      const out = BillSchema.parse(transformBill(copyOf<BokioSupplierInvoice>(fixture)))
      expect(out.lineAmountsIncludeTax).toBe(false)
      expect(out.totalAmount).toBe(total)
      expect(out.taxAmount).toBe(headerTax)
      expect(out.lineItems?.map((li) => li.taxAmount)).toEqual(taxes)
      // Line totals are net (tax-exclusive), as lineAmountsIncludeTax: false says.
      expect(out.lineItems?.map((li) => li.totalAmount)).toEqual(nets)
      // Each line's net is unitAmount × unitQuantity, and it all sums up:
      // Σ line net + header tax = totalAmount, Σ line tax = header tax,
      // Σ line total + header tax = totalAmount.
      const lineNets = out.lineItems!.map((li) => li.unitAmount! * li.unitQuantity!)
      expect(lineNets).toEqual(nets)
      const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
      expect(sum(lineNets) + out.taxAmount!).toBe(out.totalAmount)
      expect(sum(out.lineItems!.map((li) => li.taxAmount!))).toBe(out.taxAmount)
      expect(sum(out.lineItems!.map((li) => li.totalAmount!)) + out.taxAmount!).toBe(
        out.totalAmount,
      )
    },
  )

  it('leaves a line without taxRate untaxed, but still derives the header tax', () => {
    const raw = copyOf<BokioSupplierInvoice>(LIVE_SUPPLIER_INVOICE_A)
    raw.lineItems![1]!.taxRate = null
    delete raw.lineItems![0]!.taxRate
    const out = BillSchema.parse(transformBill(raw))
    expect(out.lineItems?.map((li) => [li.taxAmount, li.totalAmount])).toEqual([
      [undefined, 40_000],
      [undefined, 160_000],
    ])
    expect(out.lineAmountsIncludeTax).toBe(false)
    expect(out.taxAmount).toBe(50_000)
  })

  it('leaves the header tax unset when a line has no net amount', () => {
    const raw = copyOf<BokioSupplierInvoice>(LIVE_SUPPLIER_INVOICE_B)
    delete raw.lineItems![0]!.unitPrice
    const out = BillSchema.parse(transformBill(raw))
    expect(out.taxAmount).toBeUndefined()
    expect(out.lineItems?.[0]?.taxAmount).toBeUndefined()
    // the other line is still complete
    expect(out.lineItems?.[1]?.taxAmount).toBe(60_000)
  })

  it('leaves taxAmount and lineAmountsIncludeTax unset with no lines', () => {
    const raw = copyOf<BokioSupplierInvoice>(LIVE_SUPPLIER_INVOICE_C)
    delete raw.lineItems
    const none = BillSchema.parse(transformBill(raw))
    expect(none.taxAmount).toBeUndefined()
    expect(none.lineAmountsIncludeTax).toBeUndefined()
    const empty = BillSchema.parse(transformBill({ ...raw, lineItems: [] }))
    expect(empty.taxAmount).toBeUndefined()
    expect(empty.lineAmountsIncludeTax).toBeUndefined()
  })

  it('rounds a fractional line tax to minor units', () => {
    // 3 × 19.99 = 59.97 net; × 12 % = 7.1964 → 7.20 SEK
    const out = BillSchema.parse(
      transformBill(
        bill({
          totalAmount: 67.17,
          lineItems: [{ description: 'X', quantity: 3, unitPrice: 19.99, taxRate: 12 }],
        }),
      ),
    )
    expect(out.lineItems?.[0]?.taxAmount).toBe(720)
    expect(out.lineItems?.[0]?.totalAmount).toBe(5997)
    expect(out.taxAmount).toBe(720)
  })

  it('scales line tax by the currency: JPY is not multiplied by 100', () => {
    const out = BillSchema.parse(
      transformBill(
        bill({
          currency: 'JPY',
          totalAmount: 1250,
          lineItems: [{ description: 'X', quantity: 10, unitPrice: 100, taxRate: 25 }],
        }),
      ),
    )
    expect(out.lineItems?.[0]?.taxAmount).toBe(250)
    expect(out.taxAmount).toBe(250)
  })
})

describe('supplier credits (negative totalAmount)', () => {
  const credit = (remainingAmount: number) =>
    BillSchema.parse(
      transformBill(bill({ totalAmount: -200, remainingAmount, lineItems: undefined })),
    )

  it('stays a bill with its negative total, flagged in metadata', () => {
    const out = credit(0)
    expect(out.totalAmount).toBe(-20_000)
    expect(out.balanceAmount).toBe(0)
    expect(out.metadata?.supplierCredit).toBe(true)
  })

  it.each([
    [0, 'PAID'],
    [-100, 'PARTIALLY_PAID'],
    [-200, 'AUTHORIZED'],
    // sign mismatch
    [100, 'AUTHORIZED'],
    // |remaining| > |total|
    [-300, 'AUTHORIZED'],
  ] as const)('remainingAmount %d of −200 is %s', (remaining, status) => {
    expect(credit(remaining).status).toBe(status)
  })

  it('does not flag a positive or zero total', () => {
    expect(transformBill(bill()).metadata?.supplierCredit).toBeUndefined()
    expect(transformBill(bill({ totalAmount: 0 })).metadata?.supplierCredit).toBeUndefined()
  })
})

describe('bill attachments (uploadRefs)', () => {
  const COMPANY = 'ea9ee4dd-fae3-4aec-a7db-6fc9cc1f8135'

  it('links each uploadRef to the documented download path of the company', () => {
    const out = BillSchema.parse(transformBill(bill(), COMPANY))
    expect(out.attachments).toEqual([
      {
        id: '24f3b7c1-8d6a-4e2f-9b31-5d7c2a8e4f90',
        url: `https://api.bokio.se/v1/companies/${COMPANY}/uploads/24f3b7c1-8d6a-4e2f-9b31-5d7c2a8e4f90/download`,
      },
    ])
  })

  it('leaves attachments unset when the supplier invoice has no uploadRefs', () => {
    const raw = bill()
    delete raw.uploadRefs
    expect(BillSchema.parse(transformBill(raw, COMPANY)).attachments).toBeUndefined()
    expect(transformBill(bill({ uploadRefs: [] }), COMPANY).attachments).toBeUndefined()
  })
})

describe('untransformBill (canonical → supplierInvoiceCreate / supplierInvoiceUpdate)', () => {
  it('builds the documented create body, scaling minor units by the currency', () => {
    expect(
      untransformBill(
        {
          contactId: '6f6b2f17-3c4a-4a69-9f2d-3f5d7e1b8c90',
          billNumber: 'INV-001',
          postedAt: '2023-10-01',
          dueAt: '2023-10-15',
          totalAmount: 100_000,
          attachments: [{ id: '24f3b7c1-8d6a-4e2f-9b31-5d7c2a8e4f90' }],
        },
        'SEK',
      ),
    ).toEqual({
      supplierRef: { id: '6f6b2f17-3c4a-4a69-9f2d-3f5d7e1b8c90' },
      invoiceNumber: 'INV-001',
      invoiceDate: '2023-10-01',
      dueDate: '2023-10-15',
      totalAmount: 1000,
      uploadRef: { id: '24f3b7c1-8d6a-4e2f-9b31-5d7c2a8e4f90' },
    })
  })

  it('does not scale a zero-decimal currency by 100', () => {
    const body = untransformBill(
      { contactId: 's', postedAt: '2023-10-01', dueAt: '2023-10-15', totalAmount: 1000 },
      'JPY',
    )
    expect(body.totalAmount).toBe(1000)
  })

  it('writes lines as description + unitPrice (+ quantity)', () => {
    const body = untransformBill(
      {
        contactId: 's',
        postedAt: '2023-10-01',
        dueAt: '2023-10-15',
        totalAmount: 100_000,
        lineItems: [{ itemDescription: 'Consulting', unitAmount: 10_000, unitQuantity: 10 }],
      },
      'SEK',
    )
    expect(body.lineItems).toEqual([{ description: 'Consulting', unitPrice: 100, quantity: 10 }])
  })

  it.each([
    ['no contactId', { postedAt: '2023-10-01', dueAt: '2023-10-15', totalAmount: 1 }],
    ['no postedAt', { contactId: 's', dueAt: '2023-10-15', totalAmount: 1 }],
    ['no dueAt', { contactId: 's', postedAt: '2023-10-01', totalAmount: 1 }],
    ['no totalAmount', { contactId: 's', postedAt: '2023-10-01', dueAt: '2023-10-15' }],
    [
      'a line without unitAmount',
      {
        contactId: 's',
        postedAt: '2023-10-01',
        dueAt: '2023-10-15',
        totalAmount: 1,
        lineItems: [{ itemDescription: 'X' }],
      },
    ],
    [
      'two attachments (POST takes one uploadRef)',
      {
        contactId: 's',
        postedAt: '2023-10-01',
        dueAt: '2023-10-15',
        totalAmount: 1,
        attachments: [{ id: 'a' }, { id: 'b' }],
      },
    ],
  ])('refuses %s with a 400', (_what, data) => {
    expect(() => untransformBill(data, 'SEK')).toThrow(
      expect.objectContaining({ statusCode: 400, code: 'VALIDATION_ERROR' }),
    )
  })

  it('on update keeps the current lines when none are named (PUT removes left-out lines)', () => {
    const body = untransformBill({ totalAmount: 120_000 }, 'SEK', bill())
    expect(body).toEqual({
      supplierRef: { id: '6f6b2f17-3c4a-4a69-9f2d-3f5d7e1b8c90' },
      invoiceNumber: 'INV-001',
      invoiceDate: '2023-10-01',
      dueDate: '2023-10-15',
      totalAmount: 1200,
      lineItems: SUPPLIER_INVOICE.lineItems,
    })
  })

  it('on update lays a line with a known id over the current line, keeping its taxRate', () => {
    const body = untransformBill(
      {
        lineItems: [
          {
            id: 'a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
            itemDescription: 'Consulting, revised',
            unitAmount: 12_000,
          },
        ],
      },
      'SEK',
      bill(),
    )
    expect(body.lineItems).toEqual([
      {
        ...SUPPLIER_INVOICE.lineItems[0],
        description: 'Consulting, revised',
        unitPrice: 120,
      },
    ])
  })

  it('on update refuses attachments and an unknown line id', () => {
    expect(() => untransformBill({ attachments: [{ id: 'a' }] }, 'SEK', bill())).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    )
    expect(() =>
      untransformBill(
        { lineItems: [{ id: 'nope', itemDescription: 'X', unitAmount: 1 }] },
        'SEK',
        bill(),
      ),
    ).toThrow(expect.objectContaining({ statusCode: 400 }))
  })
})
