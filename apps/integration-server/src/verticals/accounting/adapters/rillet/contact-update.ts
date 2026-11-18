/**
 * Read-merge-write bodies for `updateContact`.
 *
 * PUT /customers/{customer_id} and PUT /vendors/{vendor_id} are full replaces:
 * "All fields must be included in the request body — omitting any field will
 * set it to null, wiping existing data. Always call retrieve-a-customer first
 * to fetch the current record, then include ALL existing fields in your update
 * request along with your changes"
 * (https://docs.api.rillet.com/reference/update-a-customer-1.md; the same
 * words for vendors on https://docs.api.rillet.com/reference/update-a-vendor-1.md).
 *
 * So the adapter GETs the record (retrieve-a-customer-1.md,
 * retrieve-a-vendor-1.md), rebuilds the documented request from every
 * writable field it carries, applies the canonical changes where a
 * documented field takes them, and PUTs the whole body. A canonical change
 * that no documented field takes is refused with 400 before any write.
 *
 * Only the documented request schemas are used to pick fields, never the
 * response: whatever the response carries beyond them (read-only fields, and
 * anything undocumented) is left out, and each nested object is projected
 * onto its own documented keys.
 *
 * v4.0 `UpdateCustomerRequest` = `CustomerRequest` + `metadata`:
 *   name (required), name_on_invoice, address (deprecated), shipping_address
 *   (deprecated), billing_addresses, shipping_addresses, emails,
 *   external_references, payment_terms, send_invoices_automatically,
 *   send_payment_reminders, allow_online_payments, fields, tax_ids, metadata.
 * `Customer` (the response) adds id, updated_at, metadata (a plain key→value
 * map), family_id ("Set through the customer-families endpoints, not here")
 * and parent_customer_id: read-only, so never sent.
 *
 * v4.0 `VendorRequest`: name (required), account_code, address, email,
 * payment_terms, external_references, ten_ninety_nine_eligible, tax_id,
 * fields. `VendorResponse` adds id and updated_at: read-only, never sent.
 */

import type { Contact } from '../../schema/contact'
import type { Address } from '../../schema/shared'
import {
  transformCustomer,
  transformVendor,
  type RilletCustomer,
  type RilletVendor,
} from './transform/contact'

function invalid(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400, code: 'VALIDATION_ERROR' })
}

// ── documented request shapes ────────────────────────────────────────────────

/** `Address`: required city, country, line1, zip_code. */
const ADDRESS_KEYS = ['line1', 'line2', 'city', 'state', 'zip_code', 'country'] as const
const ADDRESS_REQUIRED = ['line1', 'city', 'zip_code', 'country'] as const
/** `CustomerAddress`: `Address` plus the stable `id` of a stored address. */
const CUSTOMER_ADDRESS_KEYS = ['id', ...ADDRESS_KEYS] as const
/** `CustomerEmail`: email, type (MAIN_SENDER | CC | BCC). */
const CUSTOMER_EMAIL_KEYS = ['email', 'type'] as const
/** `ExternalReference`: type, id, url. */
const EXTERNAL_REFERENCE_KEYS = ['type', 'id', 'url'] as const
/** `FieldAssignments` items: field_id, field_value_id. */
const FIELD_ASSIGNMENT_KEYS = ['field_id', 'field_value_id'] as const
/** `CustomerTaxId`: type, value. */
const CUSTOMER_TAX_ID_KEYS = ['type', 'value'] as const

type Json = Record<string, unknown>

function present(v: unknown): boolean {
  return v !== undefined && v !== null
}

/** `obj` cut down to `keys`, dropping absent values; undefined when nothing is left. */
function pick(obj: unknown, keys: readonly string[]): Json | undefined {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined
  const src = obj as Json
  const out: Json = {}
  for (const k of keys) if (present(src[k])) out[k] = src[k]
  return Object.keys(out).length ? out : undefined
}

function pickList(list: unknown, keys: readonly string[]): Json[] | undefined {
  if (!Array.isArray(list)) return undefined
  return list.map((item) => pick(item, keys)).filter((x): x is Json => x !== undefined)
}

/** Copy the scalar request fields `keys` from the stored record, where set. */
function copyScalars(body: Json, raw: Json, keys: readonly string[]): void {
  for (const k of keys) if (present(raw[k])) body[k] = raw[k]
}

// ── canonical changes ────────────────────────────────────────────────────────

/**
 * Canonical fields that are not changes: the id (the path names the record),
 * timestamps, and `metadata`, which the transforms fill with the raw
 * response, so a read-modify-write caller sends it straight back.
 */
const IGNORED = new Set(['id', 'createdAt', 'updatedAt', 'metadata'])

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object')
    return Object.values(v as Json).every((x) => x === undefined || x === null || x === '')
  return false
}

/** Stable JSON, keys sorted, absent values dropped: equality for round trips. */
function canonicalJson(v: unknown): string {
  return JSON.stringify(v, (_k, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Json = {}
      for (const key of Object.keys(value as Json).sort()) {
        const x = (value as Json)[key]
        if (x !== undefined && x !== null) sorted[key] = x
      }
      return sorted
    }
    return value
  })
}

/**
 * Refuse, with 400 and before any write, every field in `data` that is a real
 * change (not empty, and not what the record already reads as) and that no
 * documented request field takes. A caller that GETs a contact and PUTs it
 * back with one field changed is not refused for the fields it left alone.
 */
function refuseUnmapped(
  data: Partial<Contact>,
  current: Contact,
  mapped: ReadonlySet<string>,
  what: 'customer' | 'vendor',
): void {
  const refused: string[] = []
  for (const [key, value] of Object.entries(data)) {
    if (IGNORED.has(key) || mapped.has(key) || isEmpty(value)) continue
    if (canonicalJson(value) === canonicalJson((current as Json)[key])) continue
    refused.push(key)
  }
  if (refused.length)
    throw invalid(
      `Rillet: no ${what} request field takes ${refused.join(', ')}; refusing rather than dropping the change (${what === 'customer' ? 'UpdateCustomerRequest' : 'VendorRequest'})`,
    )
}

/**
 * A Rillet record is a customer or a vendor; the id names one, and neither
 * endpoint changes which.
 */
function refuseRoleChange(data: Partial<Contact>, kind: 'customer' | 'vendor'): void {
  const wantsCustomer = kind === 'customer' ? data.isCustomer !== false : data.isCustomer === true
  const wantsSupplier = kind === 'vendor' ? data.isSupplier !== false : data.isSupplier === true
  if (kind === 'customer' && (!wantsCustomer || wantsSupplier))
    throw invalid(
      'Rillet: this id is a customer; a customer cannot become a vendor (isCustomer/isSupplier)',
    )
  if (kind === 'vendor' && (!wantsSupplier || wantsCustomer))
    throw invalid(
      'Rillet: this id is a vendor; a vendor cannot become a customer (isCustomer/isSupplier)',
    )
}

function requireName(name: unknown): void {
  if (typeof name !== 'string' || name.trim() === '')
    throw invalid('Rillet: name is required on a customer or vendor and cannot be cleared')
}

/**
 * The stored `Address` with the canonical one laid over it: a field the
 * caller sends replaces the stored one (null clears it), a field it leaves
 * out is kept. The result must still be a valid `Address`.
 */
function mergeAddress(stored: Json | undefined, change: Address, field: string): Json {
  const out: Json = { ...(stored ?? {}) }
  const set = (key: string, v: string | null | undefined) => {
    if (v === undefined) return
    if (v === null || v === '') delete out[key]
    else out[key] = v
  }
  set('line1', change.address1)
  set('line2', change.address2)
  set('city', change.city)
  set('state', change.region)
  set('zip_code', change.postalCode)
  set('country', change.country)
  const missing = ADDRESS_REQUIRED.filter((k) => !present(out[k]))
  if (missing.length)
    throw invalid(
      `Rillet: ${field} would lack ${missing.join(', ')}, which an Address requires (line1, city, zip_code, country)`,
    )
  return out
}

// ── customers ────────────────────────────────────────────────────────────────

const CUSTOMER_SCALARS = [
  'name',
  'name_on_invoice',
  'payment_terms',
  'send_invoices_automatically',
  'send_payment_reminders',
  'allow_online_payments',
] as const

const CUSTOMER_MAPPED = new Set([
  'name',
  'emails',
  'billingAddress',
  'shippingAddress',
  'isCustomer',
  'isSupplier',
])

/**
 * One customer address list (billing or shipping) with the canonical change
 * applied to its first entry, "the default".
 *
 * `billing_addresses`: "On update the list is authoritative: addresses sent
 * with an id are updated, addresses without an id are added, and stored
 * addresses left out are removed ... Omit to leave billing addresses
 * unchanged". The first entry is edited in place, keeping its `id`, and the
 * rest are sent back as stored. A stored list is always echoed, changed or
 * not. Clearing (null) drops the first entry only, so the next stored address
 * becomes the default; the others are never removed. When the record has no list at all, the list is omitted (kept) and a
 * change goes through the deprecated single field, which "In requests without
 * billing_addresses ... creates or edits that first billing address in place;
 * the customer's other billing addresses are left untouched" — the two
 * "Cannot be combined", so never both.
 */
function applyCustomerAddresses(
  body: Json,
  raw: RilletCustomer,
  change: Address | null | undefined,
  listKey: 'billing_addresses' | 'shipping_addresses',
  singleKey: 'address' | 'shipping_address',
  field: string,
): void {
  const list = pickList(raw[listKey], CUSTOMER_ADDRESS_KEYS)
  if (list) {
    if (change === null) body[listKey] = list.slice(1)
    else if (change !== undefined) {
      const first = mergeAddress(list[0], change, field)
      body[listKey] = [first, ...list.slice(1)]
    } else body[listKey] = list
    return
  }
  if (change === undefined) return
  const single = pick(raw[singleKey], ADDRESS_KEYS)
  if (change === null) {
    // Clearing the default needs the list: the single field cannot remove an
    // address, and sending `[]` would "remove them all", including any the
    // response did not show. Refused rather than guessed.
    if (single)
      throw invalid(
        `Rillet: cannot clear ${field} on a customer whose response carries no ${listKey}; sending an empty list would remove every stored address`,
      )
    return
  }
  body[singleKey] = mergeAddress(single, change, field)
}

/**
 * The `UpdateCustomerRequest` for `raw` with `data` applied.
 *
 * Kept as stored: every `CustomerRequest` field. `metadata` is omitted, which
 * "keep[s] all existing metadata" (update-a-customer-1.md), since the
 * response's value map is not the request's partial-update shape. `tax_ids`
 * and `allow_online_payments` are echoed too, though omitting them would also
 * keep them.
 *
 * Changes: `name`; `emails` replaces the MAIN_SENDER entries (the only ones
 * the canonical contact reads) and keeps CC and BCC entries; `billingAddress`
 * and `shippingAddress` edit the default address (see
 * {@link applyCustomerAddresses}). Everything else is refused: there is no
 * phone field, and `tax_ids` entries need a `type` (EU_VAT_REGISTRATION_NUMBER
 * | GENERIC_VAT_NUMBER) that a canonical `taxNumber` does not carry.
 */
export function customerUpdateBody(raw: RilletCustomer, data: Partial<Contact>): Json {
  refuseRoleChange(data, 'customer')
  refuseUnmapped(data, transformCustomer(raw), CUSTOMER_MAPPED, 'customer')

  const body: Json = {}
  copyScalars(body, raw, CUSTOMER_SCALARS)
  if (data.name !== undefined) {
    requireName(data.name)
    body['name'] = data.name
  }

  applyCustomerAddresses(
    body,
    raw,
    data.billingAddress,
    'billing_addresses',
    'address',
    'billingAddress',
  )
  applyCustomerAddresses(
    body,
    raw,
    data.shippingAddress,
    'shipping_addresses',
    'shipping_address',
    'shippingAddress',
  )

  const storedEmails = pickList(raw.emails, CUSTOMER_EMAIL_KEYS)
  if (data.emails !== undefined) {
    const kept = (storedEmails ?? []).filter((e) => e['type'] !== 'MAIN_SENDER')
    const seen = new Set<string>()
    const main = data.emails
      .filter((e) => !seen.has(e.email) && seen.add(e.email))
      .map((e) => ({ email: e.email, type: 'MAIN_SENDER' }))
    body['emails'] = [...main, ...kept]
  } else if (storedEmails) body['emails'] = storedEmails

  const refs = pickList(raw['external_references'], EXTERNAL_REFERENCE_KEYS)
  if (refs) body['external_references'] = refs
  const fields = pickList(raw['fields'], FIELD_ASSIGNMENT_KEYS)
  if (fields) body['fields'] = fields
  const taxIds = pickList(raw['tax_ids'], CUSTOMER_TAX_ID_KEYS)
  if (taxIds) body['tax_ids'] = taxIds
  return body
}

// ── vendors ──────────────────────────────────────────────────────────────────

const VENDOR_SCALARS = [
  'name',
  'account_code',
  'email',
  'payment_terms',
  'ten_ninety_nine_eligible',
  'tax_id',
] as const

const VENDOR_MAPPED = new Set([
  'name',
  'emails',
  'taxNumber',
  'billingAddress',
  'isCustomer',
  'isSupplier',
])

/**
 * The `VendorRequest` for `raw` with `data` applied.
 *
 * Kept as stored: every `VendorRequest` field. Changes: `name`; `emails` sets
 * the one `email` (more than one is refused; an empty list clears it);
 * `taxNumber` sets `tax_id` (null clears it); `billingAddress` edits `address`
 * (null clears it). Everything else is refused: there is no phone field and
 * no shipping address on a vendor.
 */
export function vendorUpdateBody(raw: RilletVendor, data: Partial<Contact>): Json {
  refuseRoleChange(data, 'vendor')
  refuseUnmapped(data, transformVendor(raw), VENDOR_MAPPED, 'vendor')

  const body: Json = {}
  copyScalars(body, raw, VENDOR_SCALARS)
  if (data.name !== undefined) {
    requireName(data.name)
    body['name'] = data.name
  }

  if (data.emails !== undefined) {
    const distinct = [...new Set(data.emails.map((e) => e.email))]
    if (distinct.length > 1)
      throw invalid('Rillet: a vendor has one email (VendorRequest.email); send at most one')
    if (distinct.length) body['email'] = distinct[0]
    else delete body['email']
  }

  if (data.taxNumber !== undefined) {
    if (data.taxNumber === null || data.taxNumber === '') delete body['tax_id']
    else body['tax_id'] = data.taxNumber
  }

  const address = pick(raw.address, ADDRESS_KEYS)
  if (data.billingAddress === undefined) {
    if (address) body['address'] = address
  } else if (data.billingAddress !== null) {
    body['address'] = mergeAddress(address, data.billingAddress, 'billingAddress')
  }

  const refs = pickList(raw['external_references'], EXTERNAL_REFERENCE_KEYS)
  if (refs) body['external_references'] = refs
  const fields = pickList(raw['fields'], FIELD_ASSIGNMENT_KEYS)
  if (fields) body['fields'] = fields
  return body
}
