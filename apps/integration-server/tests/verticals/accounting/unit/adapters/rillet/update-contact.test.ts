/**
 * Rillet updateContact: read, merge, write.
 *
 * PUT /customers/{id} and PUT /vendors/{id} are full replaces: "omitting any
 * field will set it to null, wiping existing data. Always call
 * retrieve-a-customer first ... then include ALL existing fields"
 * (https://docs.api.rillet.com/reference/update-a-customer-1.md,
 * https://docs.api.rillet.com/reference/update-a-vendor-1.md). The request
 * shapes asserted here are v4.0 `UpdateCustomerRequest` (`CustomerRequest` +
 * `metadata`) and `VendorRequest`; the stored records are v4.0 `Customer`
 * (retrieve-a-customer-1.md) and `VendorResponse` (retrieve-a-vendor-1.md).
 *
 * The adapter used to PUT only `{ name, emails }` (or `{ name, email }`),
 * chose the endpoint from isSupplier without reading the record, and fell
 * back from customer to vendor on any error.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { RilletAdapter } from '../../../../../../src/verticals/accounting/adapters/rillet/index'

const CREDS = { accessToken: 'rillet-api-key' }
const adapter = new RilletAdapter({ apiKey: 'rillet-api-key' })

interface Call {
  method: 'get' | 'put'
  url: string
  body?: Record<string, unknown>
}

function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } })
}

/**
 * A fake HTTP instance. GETs answer from `records` (an Error value is
 * thrown); every PUT echoes the stored record merged with its body.
 */
function fakeHttp(records: Record<string, Record<string, unknown> | Error>) {
  const calls: Call[] = []
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get: async (url: string) => {
      calls.push({ method: 'get', url })
      const r = records[url]
      if (r === undefined) throw httpError(404)
      if (r instanceof Error) throw r
      return { data: r }
    },
    put: async (url: string, body: Record<string, unknown>) => {
      calls.push({ method: 'put', url, body })
      const stored = records[url]
      return { data: { ...(stored instanceof Error ? {} : stored), ...body } }
    },
  })) as unknown as typeof axios.create)
  return calls
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

const VALIDATION = { statusCode: 400, code: 'VALIDATION_ERROR' }

const BILLING_1 = {
  id: 'addr-b1',
  line1: '1 Main St',
  line2: 'Floor 2',
  city: 'Nashville',
  state: 'TN',
  zip_code: '37201',
  country: 'US',
}
const BILLING_2 = {
  id: 'addr-b2',
  line1: '9 Side St',
  city: 'Austin',
  state: 'TX',
  zip_code: '73301',
  country: 'US',
}
const SHIPPING_1 = {
  id: 'addr-s1',
  line1: '5 Dock Rd',
  city: 'Memphis',
  state: 'TN',
  zip_code: '38103',
  country: 'US',
}

/** A v4.0 `Customer` with every documented field set, plus read-only ones. */
const CUSTOMER = {
  id: 'cust-1',
  updated_at: '2026-09-01T00:00:00Z',
  metadata: { region: 'south' },
  family_id: 'fam-1',
  parent_customer_id: 'cust-0',
  name: 'Acme',
  name_on_invoice: 'Acme Holdings LLC',
  // deprecated copies of the first list entries
  address: { ...BILLING_1, id: undefined },
  shipping_address: { ...SHIPPING_1, id: undefined },
  billing_addresses: [BILLING_1, BILLING_2],
  shipping_addresses: [SHIPPING_1],
  emails: [
    { email: 'ap@acme.test', type: 'MAIN_SENDER' },
    { email: 'cfo@acme.test', type: 'CC' },
  ],
  external_references: [{ type: 'crmId', id: 'crm-9', url: 'https://crm.test/9' }],
  payment_terms: 45,
  send_invoices_automatically: true,
  send_payment_reminders: true,
  allow_online_payments: true,
  fields: [{ field_id: 'fld-1', field_value_id: 'fv-1' }],
  tax_ids: [{ type: 'EU_VAT_REGISTRATION_NUMBER', value: 'DE123456789' }],
  undocumented_extra: 'never sent',
}

/** The customer's documented request fields, as they must go back unchanged. */
const CUSTOMER_KEPT = {
  name: 'Acme',
  name_on_invoice: 'Acme Holdings LLC',
  billing_addresses: [BILLING_1, BILLING_2],
  shipping_addresses: [SHIPPING_1],
  emails: [
    { email: 'ap@acme.test', type: 'MAIN_SENDER' },
    { email: 'cfo@acme.test', type: 'CC' },
  ],
  external_references: [{ type: 'crmId', id: 'crm-9', url: 'https://crm.test/9' }],
  payment_terms: 45,
  send_invoices_automatically: true,
  send_payment_reminders: true,
  allow_online_payments: true,
  fields: [{ field_id: 'fld-1', field_value_id: 'fv-1' }],
  tax_ids: [{ type: 'EU_VAT_REGISTRATION_NUMBER', value: 'DE123456789' }],
}

/** A v4.0 `VendorResponse` with every `VendorRequest` field set. */
const VENDOR = {
  id: 'vend-1',
  updated_at: '2026-09-01T00:00:00Z',
  name: 'Paper Co',
  account_code: '2000',
  address: {
    line1: '7 Mill Ln',
    line2: 'Unit 3',
    city: 'Portland',
    state: 'OR',
    zip_code: '97201',
    country: 'US',
  },
  email: 'billing@paper.test',
  payment_terms: 30,
  external_references: [{ type: 'erpId', id: 'erp-4' }],
  ten_ninety_nine_eligible: true,
  tax_id: '12-3456789',
  fields: [{ field_id: 'fld-2', field_value_id: 'fv-2' }],
}

const VENDOR_KEPT = {
  name: 'Paper Co',
  account_code: '2000',
  address: {
    line1: '7 Mill Ln',
    line2: 'Unit 3',
    city: 'Portland',
    state: 'OR',
    zip_code: '97201',
    country: 'US',
  },
  email: 'billing@paper.test',
  payment_terms: 30,
  external_references: [{ type: 'erpId', id: 'erp-4' }],
  ten_ninety_nine_eligible: true,
  tax_id: '12-3456789',
  fields: [{ field_id: 'fld-2', field_value_id: 'fv-2' }],
}

// ── customers ─────────────────────────────────────────────────────────────

describe('RilletAdapter.updateContact (customer)', () => {
  it('GETs the customer, then PUTs every documented field with only the name changed', async () => {
    const calls = fakeHttp({ 'customers/cust-1': CUSTOMER })
    const out = await adapter.updateContact(CREDS, 'cust-1', { name: 'Acme Corp' })
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'get customers/cust-1',
      'put customers/cust-1',
    ])
    // Exact body: payment_terms, name_on_invoice, addresses, tax_ids, ... all
    // kept; id, updated_at, metadata, family_id, parent_customer_id, the
    // deprecated address copies and undocumented keys are not sent.
    expect(calls[1].body).toEqual({ ...CUSTOMER_KEPT, name: 'Acme Corp' })
    expect(out.name).toBe('Acme Corp')
  })

  it('replaces the MAIN_SENDER emails and keeps the CC/BCC ones', async () => {
    const calls = fakeHttp({ 'customers/cust-1': CUSTOMER })
    await adapter.updateContact(CREDS, 'cust-1', {
      emails: [{ email: 'new@acme.test' }, { email: 'also@acme.test', type: 'WORK' }],
    })
    expect(calls[1].body).toEqual({
      ...CUSTOMER_KEPT,
      emails: [
        { email: 'new@acme.test', type: 'MAIN_SENDER' },
        { email: 'also@acme.test', type: 'MAIN_SENDER' },
        { email: 'cfo@acme.test', type: 'CC' },
      ],
    })
  })

  it('edits the default billing address in place, keeping its id and the other addresses', async () => {
    const calls = fakeHttp({ 'customers/cust-1': CUSTOMER })
    await adapter.updateContact(CREDS, 'cust-1', {
      billingAddress: { address1: '2 Main St', address2: null, postalCode: '37202' },
      shippingAddress: { city: 'Knoxville', postalCode: '37902' },
    })
    expect(calls[1].body).toEqual({
      ...CUSTOMER_KEPT,
      billing_addresses: [
        {
          id: 'addr-b1',
          line1: '2 Main St',
          city: 'Nashville',
          state: 'TN',
          zip_code: '37202',
          country: 'US',
        },
        BILLING_2,
      ],
      shipping_addresses: [{ ...SHIPPING_1, city: 'Knoxville', zip_code: '37902' }],
    })
  })

  it('accepts a round trip of its own getContact output unchanged', async () => {
    const calls = fakeHttp({ 'customers/cust-1': CUSTOMER })
    const current = await adapter.getContact(CREDS, 'cust-1')
    await adapter.updateContact(CREDS, 'cust-1', current)
    expect(calls.at(-1)?.body).toEqual(CUSTOMER_KEPT)
  })

  it.each([
    ['telephones', { telephones: [{ telephone: '+15550100' }] }],
    ['taxNumber (tax_ids needs a type)', { taxNumber: 'DE999' }],
    ['currency', { currency: 'EUR' }],
    ['companyName', { companyName: 'Acme Inc' }],
    ['isActive', { isActive: false }],
    ['a customer becoming a vendor', { isSupplier: true }],
    ['a billing address without the required fields', { billingAddress: { city: 'X' } }],
  ])('refuses %s with 400 before any write', async (_label, data) => {
    const calls = fakeHttp({
      'customers/cust-1': { ...CUSTOMER, billing_addresses: [], address: undefined },
    })
    expect(await refusal(adapter.updateContact(CREDS, 'cust-1', data as never))).toEqual(VALIDATION)
    expect(calls.filter((c) => c.method === 'put')).toEqual([])
  })

  it('omits an address list the record does not have, and edits through the single field', async () => {
    const legacy = { ...CUSTOMER, billing_addresses: undefined, shipping_addresses: undefined }
    const calls = fakeHttp({ 'customers/cust-1': legacy })
    await adapter.updateContact(CREDS, 'cust-1', { billingAddress: { city: 'Franklin' } })
    const { billing_addresses: _b, shipping_addresses: _s, ...rest } = CUSTOMER_KEPT
    expect(calls[1].body).toEqual({
      ...rest,
      address: {
        line1: '1 Main St',
        line2: 'Floor 2',
        city: 'Franklin',
        state: 'TN',
        zip_code: '37201',
        country: 'US',
      },
    })
  })
  it('clears the default billing address by dropping only the first list entry', async () => {
    const calls = fakeHttp({ 'customers/cust-1': CUSTOMER })
    await adapter.updateContact(CREDS, 'cust-1', { billingAddress: null })
    expect(calls[1].body).toEqual({ ...CUSTOMER_KEPT, billing_addresses: [BILLING_2] })
  })

  it('refuses to clear an address when the record carries no list, before any write', async () => {
    const legacy = { ...CUSTOMER, billing_addresses: undefined, shipping_addresses: undefined }
    const calls = fakeHttp({ 'customers/cust-1': legacy })
    expect(await refusal(adapter.updateContact(CREDS, 'cust-1', { billingAddress: null }))).toEqual(
      VALIDATION,
    )
    expect(calls.filter((c) => c.method === 'put')).toEqual([])
  })
})

// ── vendors ───────────────────────────────────────────────────────────────

describe('RilletAdapter.updateContact (vendor)', () => {
  it('falls back to the vendor on a customer 404, and PUTs every VendorRequest field', async () => {
    const calls = fakeHttp({ 'vendors/vend-1': VENDOR })
    await adapter.updateContact(CREDS, 'vend-1', {
      name: 'Paper Company',
      taxNumber: '98-7654321',
      emails: [{ email: 'ap@paper.test' }],
      billingAddress: { address1: '8 Mill Ln' },
    })
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'get customers/vend-1',
      'get vendors/vend-1',
      'put vendors/vend-1',
    ])
    expect(calls[2].body).toEqual({
      ...VENDOR_KEPT,
      name: 'Paper Company',
      tax_id: '98-7654321',
      email: 'ap@paper.test',
      address: { ...VENDOR_KEPT.address, line1: '8 Mill Ln' },
    })
  })

  it('keeps every field on a name-only change', async () => {
    const calls = fakeHttp({ 'vendors/vend-1': VENDOR })
    await adapter.updateContact(CREDS, 'vend-1', { name: 'Paper Company', isSupplier: true })
    expect(calls[2].body).toEqual({ ...VENDOR_KEPT, name: 'Paper Company' })
  })

  it.each([
    ['more than one email', { emails: [{ email: 'a@p.test' }, { email: 'b@p.test' }] }],
    ['a shipping address', { shippingAddress: { address1: '1 Dock', city: 'P' } }],
    ['telephones', { telephones: [{ telephone: '+15550100' }] }],
    ['a vendor becoming a customer', { isCustomer: true }],
  ])('refuses %s with 400 before any write', async (_label, data) => {
    const calls = fakeHttp({ 'vendors/vend-1': VENDOR })
    expect(await refusal(adapter.updateContact(CREDS, 'vend-1', data as never))).toEqual(VALIDATION)
    expect(calls.filter((c) => c.method === 'put')).toEqual([])
  })
  it('clears email, tax_id and address when asked, keeping the rest', async () => {
    const calls = fakeHttp({ 'vendors/vend-1': VENDOR })
    await adapter.updateContact(CREDS, 'vend-1', {
      emails: [],
      taxNumber: null,
      billingAddress: null,
    })
    const { email: _e, tax_id: _t, address: _a, ...rest } = VENDOR_KEPT
    expect(calls[2].body).toEqual(rest)
  })

  it('accepts a round trip of its own getContact output unchanged', async () => {
    const calls = fakeHttp({ 'vendors/vend-1': VENDOR })
    const current = await adapter.getContact(CREDS, 'vend-1')
    await adapter.updateContact(CREDS, 'vend-1', current)
    expect(calls.at(-1)?.body).toEqual(VENDOR_KEPT)
  })
})

// ── lookup ────────────────────────────────────────────────────────────────

describe('RilletAdapter contact lookup', () => {
  it.each([401, 500])(
    'does not fall back to vendors when the customer GET fails with %i',
    async (status) => {
      const calls = fakeHttp({ 'customers/x': httpError(status), 'vendors/x': VENDOR })
      const err = await adapter.updateContact(CREDS, 'x', { name: 'N' }).catch((e: unknown) => e)
      expect((err as { response?: { status?: number } }).response?.status).toBe(status)
      expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(['get customers/x'])

      const err2 = await adapter.getContact(CREDS, 'x').catch((e: unknown) => e)
      expect((err2 as { response?: { status?: number } }).response?.status).toBe(status)
      expect(calls.some((c) => c.url === 'vendors/x')).toBe(false)
    },
  )

  it('getContact falls back to the vendor on a customer 404', async () => {
    fakeHttp({ 'vendors/vend-1': VENDOR })
    const c = await adapter.getContact(CREDS, 'vend-1')
    expect(c.isSupplier).toBe(true)
    expect(c.taxNumber).toBe('12-3456789')
  })
})
