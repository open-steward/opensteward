/**
 * Rillet write paths, against the v4.0 reference the adapter now requests
 * (`X-Rillet-API-Version: 4`; https://docs.api.rillet.com/llms.txt).
 *
 * Request amounts are `RoundedMonetaryAmount`, which "must be rounded to the
 * currency's default decimal places", so minor units scale by the currency:
 * 5000 JPY minor units is "5000", not "50.00".
 *
 * Bodies follow the documented request schemas:
 *   - POST /invoices (create-an-invoice-1.md): `CreateInvoiceRequest` is a
 *     oneOf discriminated by `scope`; FULL requires `customer_id`,
 *     `invoice_date`, `items`, and each item `description` + `price`
 *     (`product_id`, `quantity`, `amount_per_unit`). The adapter used to send
 *     no `scope` and a flat `gross_rate` item, which matches none of them.
 *   - POST /journal-entries (create-a-journal-entry.md):
 *     `JournalEntryItemRequest` requires `account_code`; the adapter used to
 *     send `account_id`, which the request schema does not have.
 *   - POST /charges (create-a-charge.md): exactly one of
 *     `credit_card_account_code` ("The Credit Card liability account") /
 *     `funding_account_code` ("The bank account"); the adapter picks it from
 *     the chart `type` of the canonical `Expense.accountId` (the paying
 *     account). It used to send neither, which Rillet rejects.
 *   - PUT /invoices/{id} (update-an-invoice-1.md): FULL requires
 *     `bank_account_id`; no canonical field carries it, so 501.
 * Every refusal happens before any request.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { RilletAdapter } from '../../../../../../src/verticals/accounting/adapters/rillet/index'
import { InvoiceSchema } from '../../../../../../src/verticals/accounting/schema/invoice'
import { JournalSchema } from '../../../../../../src/verticals/accounting/schema/journal'
import { BillSchema } from '../../../../../../src/verticals/accounting/schema/bill'
import { ExpenseSchema } from '../../../../../../src/verticals/accounting/schema/expense'

const CREDS = { accessToken: 'rillet-api-key' }
const adapter = new RilletAdapter({ apiKey: 'rillet-api-key' })

interface Call {
  method: 'get' | 'post' | 'put' | 'delete'
  url: string
  body?: Record<string, unknown>
}

/** The v4.0 `Account` rows GET /accounts answers with (list-all-accounts.md). */
const CHART = [
  {
    id: 'acc-uuid-cash',
    code: '1000',
    name: 'Cash',
    type: 'ASSET',
    subtype: 'BANK',
    status: 'ACTIVE',
    intercompany: false,
    parent_grouping: 'Cash',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'acc-uuid-card',
    code: '2100',
    name: 'Amex',
    type: 'LIABILITY',
    subtype: 'Credit Card',
    status: 'ACTIVE',
    intercompany: false,
    parent_grouping: 'Credit Cards',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'acc-uuid-rev',
    code: '4000',
    name: 'Revenue',
    type: 'INCOME',
    subtype: 'REVENUE',
    status: 'ACTIVE',
    intercompany: false,
    parent_grouping: 'Revenue',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

/**
 * A fake HTTP instance: records every call, answers GET /accounts with the
 * chart, and every POST with `reply`. Also records each axios.create config.
 */
function fakeHttp(reply: Record<string, unknown> = {}) {
  const calls: Call[] = []
  const configs: Array<{ headers?: Record<string, string> }> = []
  vi.spyOn(axios, 'create').mockImplementation(((config: { headers?: Record<string, string> }) => {
    configs.push(config)
    return {
      get: async (url: string) => {
        calls.push({ method: 'get', url })
        if (url === 'accounts') return { data: { accounts: CHART } }
        return { data: reply }
      },
      post: async (url: string, body: Record<string, unknown>) => {
        calls.push({ method: 'post', url, body })
        return { data: reply }
      },
      put: async (url: string, body: Record<string, unknown>) => {
        calls.push({ method: 'put', url, body })
        return { data: reply }
      },
      delete: async (url: string) => {
        calls.push({ method: 'delete', url })
        return { data: undefined }
      },
    }
  }) as unknown as typeof axios.create)
  return { calls, configs }
}

afterEach(() => {
  vi.restoreAllMocks()
})

async function refusal(p: Promise<unknown>): Promise<{ statusCode?: number; code?: string }> {
  const err = await p.then(
    () => {
      throw new Error('expected a refusal')
    },
    (e: unknown) => e as { statusCode?: number; code?: string },
  )
  return { statusCode: err.statusCode, code: err.code }
}

const NOT_SUPPORTED = { statusCode: 501, code: 'NOT_SUPPORTED' }
const VALIDATION = { statusCode: 400, code: 'VALIDATION_ERROR' }

// ── version ───────────────────────────────────────────────────────────────

describe('RilletAdapter API version', () => {
  it('sends X-Rillet-API-Version: 4 on every request', async () => {
    const { configs } = fakeHttp({
      id: 'org_1',
      currency: 'USD',
      timezone: 'UTC',
      trade_name: 'Acme',
    })
    await adapter.getOrganization(CREDS)
    expect(configs).toHaveLength(1)
    expect(configs[0].headers?.['X-Rillet-API-Version']).toBe('4')
  })
})

// ── invoices ──────────────────────────────────────────────────────────────

const INVOICE_REPLY = {
  id: 'inv_1',
  subsidiary_id: 'sub_1',
  invoice_number: 'INV-1',
  customer_id: 'cust_1',
  items: [],
  due_date: '2026-03-01',
  invoice_date: '2026-02-01',
  status: 'UNPAID',
  net_amount: { amount: '3000', currency: 'JPY' },
  amount_due: { amount: '3000', currency: 'JPY' },
  total: { amount: '3000', currency: 'JPY' },
  subtotal: { amount: '3000', currency: 'JPY' },
  total_discount: { amount: '0', currency: 'JPY' },
  taxed_amount: { amount: '0', currency: 'JPY' },
  payment_terms: 28,
  overdue: false,
  updated_at: '2026-02-01T00:00:00Z',
}

const INVOICE = {
  contactId: 'cust_1',
  currency: 'JPY',
  postedAt: '2026-02-01',
  dueAt: '2026-03-01',
  notes: 'Thanks',
  reference: 'PO-9',
  lineItems: [
    {
      itemId: 'prod_1',
      itemDescription: 'Seats',
      unitQuantity: 2,
      unitAmount: 1500,
      accountCode: '4000',
    },
  ],
}

describe('RilletAdapter.createInvoice', () => {
  it('sends a FULL-scope CreateFullInvoiceRequest', async () => {
    const { calls } = fakeHttp(INVOICE_REPLY)
    const out = InvoiceSchema.parse(await adapter.createInvoice(CREDS, INVOICE))
    expect(calls).toEqual([
      {
        method: 'post',
        url: 'invoices',
        body: {
          scope: 'FULL',
          customer_id: 'cust_1',
          invoice_date: '2026-02-01',
          due_date: '2026-03-01',
          memo: 'Thanks',
          purchase_order_number: 'PO-9',
          items: [
            {
              description: 'Seats',
              price: {
                product_id: 'prod_1',
                quantity: 2,
                amount_per_unit: { amount: '1500', currency: 'JPY' },
              },
              revenue: { account_code: '4000' },
            },
          ],
        },
      },
    ])
    expect(out.id).toBe('inv_1')
    expect(out.totalAmount).toBe(3000)
  })

  it('scales a USD unit rate to two decimals', async () => {
    const { calls } = fakeHttp(INVOICE_REPLY)
    await adapter.createInvoice(CREDS, {
      ...INVOICE,
      currency: 'USD',
      lineItems: [
        { itemId: 'prod_1', itemDescription: 'Seats', unitQuantity: 1, unitAmount: 1250 },
      ],
    })
    const item = (calls[0].body?.items as Array<{ price: Record<string, unknown> }>)[0]
    expect(item.price.amount_per_unit).toEqual({ amount: '12.50', currency: 'USD' })
    expect(item).not.toHaveProperty('revenue')
  })

  it('resolves a line accountId to revenue.account_code through GET /accounts', async () => {
    const { calls } = fakeHttp(INVOICE_REPLY)
    await adapter.createInvoice(CREDS, {
      ...INVOICE,
      lineItems: [
        { ...INVOICE.lineItems[0], accountCode: undefined, accountId: 'acc-uuid-rev' },
        { ...INVOICE.lineItems[0], accountCode: undefined },
      ],
    })
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['get', 'accounts'],
      ['post', 'invoices'],
    ])
    const items = calls[1].body?.items as Array<Record<string, unknown>>
    expect(items[0].revenue).toEqual({ account_code: '4000' })
    expect(items[1]).not.toHaveProperty('revenue')
  })

  it('refuses a line accountId the chart does not have with 400, before any write', async () => {
    const { calls } = fakeHttp(INVOICE_REPLY)
    const lineItems = [{ ...INVOICE.lineItems[0], accountCode: undefined, accountId: 'nope' }]
    expect(await refusal(adapter.createInvoice(CREDS, { ...INVOICE, lineItems }))).toEqual(
      VALIDATION,
    )
    expect(calls).toEqual([{ method: 'get', url: 'accounts' }])
  })

  it.each([
    ['an invoiceNumber (FULL assigns it)', { invoiceNumber: 'INV-7' }],
    ['a line discount', { lineItems: [{ ...INVOICE.lineItems[0], discountAmount: 100 }] }],
    ['line tax', { lineItems: [{ ...INVOICE.lineItems[0], taxAmount: 100 }] }],
    ['a line tax rate', { lineItems: [{ ...INVOICE.lineItems[0], taxrateId: 'tr_1' }] }],
  ])('refuses %s with 501 before any request', async (_what, patch) => {
    const { calls } = fakeHttp(INVOICE_REPLY)
    expect(await refusal(adapter.createInvoice(CREDS, { ...INVOICE, ...patch }))).toEqual(
      NOT_SUPPORTED,
    )
    expect(calls).toEqual([])
  })

  it.each([
    ['no contactId', { contactId: undefined }],
    ['no postedAt', { postedAt: undefined }],
    ['no currency', { currency: undefined }],
    ['no line items', { lineItems: [] }],
    ['a line with no itemId', { lineItems: [{ ...INVOICE.lineItems[0], itemId: undefined }] }],
    [
      'a line with no description',
      { lineItems: [{ ...INVOICE.lineItems[0], itemDescription: undefined }] },
    ],
    [
      'a line with no quantity',
      { lineItems: [{ ...INVOICE.lineItems[0], unitQuantity: undefined }] },
    ],
    [
      'a line with no unitAmount',
      { lineItems: [{ ...INVOICE.lineItems[0], unitAmount: undefined }] },
    ],
  ])('refuses %s with 400 before any request', async (_what, patch) => {
    const { calls } = fakeHttp(INVOICE_REPLY)
    expect(await refusal(adapter.createInvoice(CREDS, { ...INVOICE, ...patch }))).toEqual(
      VALIDATION,
    )
    expect(calls).toEqual([])
  })
})

describe('RilletAdapter.updateInvoice', () => {
  it('refuses with 501 before any request (bank_account_id and scope have no canonical source)', async () => {
    const { calls } = fakeHttp(INVOICE_REPLY)
    expect(await refusal(adapter.updateInvoice(CREDS, 'inv_1', INVOICE))).toEqual(NOT_SUPPORTED)
    expect(calls).toEqual([])
  })
})

// ── journal entries ───────────────────────────────────────────────────────

const JOURNAL_REPLY = {
  id: 'je_1',
  book_id: 'book_1',
  name: 'Accrual',
  currency: 'BHD',
  date: '2026-02-01',
  items: [
    {
      id: 'l1',
      amount: { amount: '0.125', currency: 'BHD' },
      account_id: 'acc-uuid-cash',
      account_code: '1000',
      side: 'DEBIT',
    },
    {
      id: 'l2',
      amount: { amount: '0.125', currency: 'BHD' },
      account_id: 'acc-uuid-rev',
      account_code: '4000',
      side: 'CREDIT',
    },
  ],
  updated_at: '2026-02-01T00:00:00Z',
}

const JOURNAL = {
  description: 'Accrual',
  currency: 'BHD',
  postedAt: '2026-02-01',
  lineItems: [
    { accountId: 'acc-uuid-cash', debitAmount: 125, description: 'cash in' },
    { accountId: 'acc-uuid-rev', creditAmount: 125 },
  ],
}

describe('RilletAdapter.createJournal', () => {
  it('resolves each accountId to its account_code through GET /accounts', async () => {
    const { calls } = fakeHttp(JOURNAL_REPLY)
    const out = JournalSchema.parse(await adapter.createJournal(CREDS, JOURNAL))
    expect(calls).toEqual([
      { method: 'get', url: 'accounts' },
      {
        method: 'post',
        url: 'journal-entries',
        body: {
          name: 'Accrual',
          currency: 'BHD',
          date: '2026-02-01',
          items: [
            {
              account_code: '1000',
              side: 'DEBIT',
              amount: { amount: '0.125', currency: 'BHD' },
              description: 'cash in',
            },
            { account_code: '4000', side: 'CREDIT', amount: { amount: '0.125', currency: 'BHD' } },
          ],
        },
      },
    ])
    expect(out.lineItems?.[0]?.debitAmount).toBe(125)
  })

  it('refuses an accountId the chart does not have with 400, after the lookup and before any write', async () => {
    const { calls } = fakeHttp(JOURNAL_REPLY)
    const lines = [JOURNAL.lineItems[0], { accountId: 'acc-uuid-missing', creditAmount: 125 }]
    expect(await refusal(adapter.createJournal(CREDS, { ...JOURNAL, lineItems: lines }))).toEqual(
      VALIDATION,
    )
    expect(calls).toEqual([{ method: 'get', url: 'accounts' }])
  })

  it.each([
    ['no description', { description: undefined }],
    ['no currency', { currency: undefined }],
    ['no postedAt', { postedAt: undefined }],
    ['a single line', { lineItems: [JOURNAL.lineItems[0]] }],
    ['a line with no account', { lineItems: [JOURNAL.lineItems[0], { creditAmount: 125 }] }],
    [
      'a line with both sides',
      { lineItems: [{ ...JOURNAL.lineItems[0], creditAmount: 5 }, JOURNAL.lineItems[1]] },
    ],
    [
      'a line with neither side',
      { lineItems: [JOURNAL.lineItems[0], { accountId: 'acc-uuid-rev', creditAmount: 0 }] },
    ],
    [
      'unbalanced lines',
      { lineItems: [JOURNAL.lineItems[0], { accountId: 'acc-uuid-rev', creditAmount: 100 }] },
    ],
  ])('refuses %s with 400 before any request', async (_what, patch) => {
    const { calls } = fakeHttp(JOURNAL_REPLY)
    expect(await refusal(adapter.createJournal(CREDS, { ...JOURNAL, ...patch }))).toEqual(
      VALIDATION,
    )
    expect(calls).toEqual([])
  })
})

// ── bills ─────────────────────────────────────────────────────────────────

const BILL_REPLY = {
  id: 'bill_1',
  vendor_id: 'vendor_1',
  expense_number: 'B1',
  items: [],
  bill_date: '2026-02-01',
  due_date: '2026-03-01',
  status: 'DRAFT',
  updated_at: '2026-02-01T00:00:00Z',
}

const BILL = {
  contactId: 'vendor_1',
  billNumber: 'B1',
  postedAt: '2026-02-01',
  dueAt: '2026-03-01',
}

describe('RilletAdapter.createBill', () => {
  it.each([
    ['JPY', 5000, '5000'],
    ['KWD', 12345, '12.345'],
    ['USD', 1250, '12.50'],
  ])(
    'sends %s minor units %d as "%s", by accountCode without a lookup',
    async (currency, minor, expected) => {
      const { calls } = fakeHttp(BILL_REPLY)
      BillSchema.parse(
        await adapter.createBill(CREDS, {
          ...BILL,
          currency,
          lineItems: [{ accountCode: '6200', totalAmount: minor }],
        }),
      )
      expect(calls.map((c) => [c.method, c.url])).toEqual([['post', 'bills']])
      expect(calls[0].body).toEqual({
        vendor_id: 'vendor_1',
        expense_number: 'B1',
        bill_date: '2026-02-01',
        due_date: '2026-03-01',
        items: [{ account_code: '6200', amount: { amount: expected, currency } }],
      })
    },
  )

  it('resolves an accountId to its code rather than sending the uuid as account_code', async () => {
    const { calls } = fakeHttp(BILL_REPLY)
    await adapter.createBill(CREDS, {
      ...BILL,
      currency: 'USD',
      lineItems: [{ accountId: 'acc-uuid-rev', totalAmount: 100 }],
    })
    expect(calls[0]).toEqual({ method: 'get', url: 'accounts' })
    expect((calls[1].body?.items as Array<Record<string, unknown>>)[0].account_code).toBe('4000')
  })

  it.each([
    ['line tax', { taxAmount: 10 }],
    ['a line tax rate', { taxrateId: 'tr_1' }],
  ])(
    'refuses %s with 501 before any request (ExpenseTaxRate has no canonical source)',
    async (_what, patch) => {
      const { calls } = fakeHttp(BILL_REPLY)
      const data = {
        ...BILL,
        currency: 'USD',
        lineItems: [{ accountCode: '6200', totalAmount: 110, ...patch }],
      }
      expect(await refusal(adapter.createBill(CREDS, data))).toEqual(NOT_SUPPORTED)
      expect(calls).toEqual([])
    },
  )

  it.each([
    ['no billNumber', { billNumber: undefined }],
    ['no dueAt', { dueAt: undefined }],
    ['no currency', { currency: undefined }],
  ])('refuses %s with 400 before any request', async (_what, patch) => {
    const { calls } = fakeHttp(BILL_REPLY)
    const data = {
      ...BILL,
      currency: 'USD',
      lineItems: [{ accountCode: '6200', totalAmount: 1 }],
      ...patch,
    }
    expect(await refusal(adapter.createBill(CREDS, data))).toEqual(VALIDATION)
    expect(calls).toEqual([])
  })
})

// ── charges ───────────────────────────────────────────────────────────────

const CHARGE_REPLY = {
  id: 'ch_1',
  vendor_id: 'vendor_1',
  charge_date: '2026-02-01',
  status: 'UNPAID',
  items: [
    {
      id: 'ci_1',
      description: 'Taxi',
      account_code: '7400',
      amount: { amount: '32050', currency: 'JPY' },
    },
  ],
  updated_at: '2026-02-01T00:00:00Z',
}

const CHARGE = {
  contactId: 'vendor_1',
  currency: 'JPY',
  postedAt: '2026-02-01',
  accountId: 'acc-uuid-card',
  lineItems: [{ itemDescription: 'Taxi', accountCode: '7400', totalAmount: 32050 }],
}

describe('RilletAdapter.createExpense', () => {
  it('sends a post-paid card charge with credit_card_account_code when accountId is a LIABILITY account', async () => {
    const { calls } = fakeHttp(CHARGE_REPLY)
    const out = ExpenseSchema.parse(await adapter.createExpense(CREDS, CHARGE))
    expect(calls).toEqual([
      { method: 'get', url: 'accounts' },
      {
        method: 'post',
        url: 'charges',
        body: {
          vendor_id: 'vendor_1',
          charge_date: '2026-02-01',
          credit_card_account_code: '2100',
          items: [
            {
              description: 'Taxi',
              account_code: '7400',
              amount: { amount: '32050', currency: 'JPY' },
            },
          ],
        },
      },
    ])
    expect(out.id).toBe('ch_1')
    expect(out.lineItems?.[0]?.totalAmount).toBe(32050)
  })

  it('sends funding_account_code when accountId is an ASSET (bank) account, and resolves line accountIds', async () => {
    const { calls } = fakeHttp(CHARGE_REPLY)
    await adapter.createExpense(CREDS, {
      ...CHARGE,
      currency: 'USD',
      accountId: 'acc-uuid-cash',
      lineItems: [{ accountId: 'acc-uuid-rev', totalAmount: 1250 }],
    })
    expect(calls.filter((c) => c.method === 'get')).toEqual([{ method: 'get', url: 'accounts' }])
    const body = calls[1].body
    expect(body).toMatchObject({ funding_account_code: '1000' })
    expect(body).not.toHaveProperty('credit_card_account_code')
    expect(body?.items).toEqual([
      { account_code: '4000', amount: { amount: '12.50', currency: 'USD' } },
    ])
  })

  it.each([
    ['an accountId the chart does not have', { accountId: 'acc-uuid-missing' }],
    ['an accountId that is neither a card nor a bank account', { accountId: 'acc-uuid-rev' }],
  ])('refuses %s with 400 after the lookup and before any write', async (_what, patch) => {
    const { calls } = fakeHttp(CHARGE_REPLY)
    expect(await refusal(adapter.createExpense(CREDS, { ...CHARGE, ...patch }))).toEqual(VALIDATION)
    expect(calls).toEqual([{ method: 'get', url: 'accounts' }])
  })

  it.each([
    ['no accountId (the paying card or bank account)', { accountId: undefined }],
    ['no contactId', { contactId: undefined }],
    ['no postedAt', { postedAt: undefined }],
    ['no currency', { currency: undefined }],
    ['no line items', { lineItems: [] }],
    ['a line with no account', { lineItems: [{ totalAmount: 1 }] }],
    ['a line with no amount', { lineItems: [{ accountCode: '7400' }] }],
  ])('refuses %s with 400 before any request', async (_what, patch) => {
    const { calls } = fakeHttp(CHARGE_REPLY)
    expect(await refusal(adapter.createExpense(CREDS, { ...CHARGE, ...patch }))).toEqual(VALIDATION)
    expect(calls).toEqual([])
  })

  it('refuses line tax with 501 before any request', async () => {
    const { calls } = fakeHttp(CHARGE_REPLY)
    const lineItems = [{ ...CHARGE.lineItems[0], taxAmount: 100 }]
    expect(await refusal(adapter.createExpense(CREDS, { ...CHARGE, lineItems }))).toEqual(
      NOT_SUPPORTED,
    )
    expect(calls).toEqual([])
  })
})
