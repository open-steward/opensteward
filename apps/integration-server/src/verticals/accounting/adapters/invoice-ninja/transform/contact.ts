/**
 * Invoice Ninja v5 contact transforms.
 *
 * Invoice Ninja has two separate resource types:
 *  - clients  → canonical Contact (isCustomer=true)
 *  - vendors  → canonical Contact (isSupplier=true)
 *
 * Client contacts (the people array on a client) are flattened into emails/phones.
 */

import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toAddress, nonempty, composeName } from '../../shared/transform'
import { currencyIdToIso } from '../constants'

// ── Client ────────────────────────────────────────────────────────────────────

export interface InvoiceNinjaClientContact {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface InvoiceNinjaClient {
  id: string
  name?: string | null
  vat_number?: string | null
  id_number?: string | null
  phone?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country_id?: string | null
  shipping_address1?: string | null
  shipping_address2?: string | null
  shipping_city?: string | null
  shipping_state?: string | null
  shipping_postal_code?: string | null
  shipping_country_id?: string | null
  currency_id?: string | null
  is_deleted?: boolean | null
  contacts?: InvoiceNinjaClientContact[] | null
  updated_at?: number | null
  created_at?: number | null
  [key: string]: unknown
}

// ── Vendor ────────────────────────────────────────────────────────────────────

export interface InvoiceNinjaVendorContact {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface InvoiceNinjaVendor {
  id: string
  name?: string | null
  vat_number?: string | null
  id_number?: string | null
  phone?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country_id?: string | null
  currency_id?: string | null
  is_deleted?: boolean | null
  contacts?: InvoiceNinjaVendorContact[] | null
  updated_at?: number | null
  created_at?: number | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseEpoch(n?: number | null): Date | undefined {
  if (!n) return undefined
  return new Date(n * 1000)
}

function buildTelephones(phone?: string | null): Telephone[] {
  const result: Telephone[] = []
  if (phone) result.push({ telephone: phone, type: 'WORK' })
  return result
}

function buildEmails(contacts?: InvoiceNinjaClientContact[] | InvoiceNinjaVendorContact[] | null) {
  const emails: Array<{ email: string; type: 'WORK' }> = []
  for (const c of contacts ?? []) {
    if (c.email) emails.push({ email: c.email, type: 'WORK' })
  }
  return emails
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformClient(raw: InvoiceNinjaClient): Contact {
  return {
    id: raw.id,
    name: raw.name || undefined,
    taxNumber: raw.vat_number || undefined,
    identification: raw.id_number || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: !raw.is_deleted,
    currency: currencyIdToIso(raw.currency_id),
    emails: nonempty(buildEmails(raw.contacts)),
    telephones: nonempty(buildTelephones(raw.phone)),
    billingAddress: toAddress({
      address1: raw.address1,
      address2: raw.address2,
      city: raw.city,
      region: raw.state,
      postalCode: raw.postal_code,
      country: raw.country_id ? String(raw.country_id) : undefined,
    }),
    shippingAddress: toAddress({
      address1: raw.shipping_address1,
      address2: raw.shipping_address2,
      city: raw.shipping_city,
      region: raw.shipping_state,
      postalCode: raw.shipping_postal_code,
      country: raw.shipping_country_id ? String(raw.shipping_country_id) : undefined,
    }),
    createdAt: parseEpoch(raw.created_at),
    updatedAt: parseEpoch(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformVendor(raw: InvoiceNinjaVendor): Contact {
  const primaryContact = raw.contacts?.[0]
  const name = raw.name || composeName(undefined, primaryContact?.first_name, primaryContact?.last_name)
  return {
    // Prefix vendor IDs with 'v_' so getContact/updateContact can route to
    // /vendors/{id} rather than /clients/{id}. The raw platform ID is stored
    // in metadata for reference.
    id: `v_${raw.id}`,
    name: name || undefined,
    taxNumber: raw.vat_number || undefined,
    identification: raw.id_number || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: !raw.is_deleted,
    currency: currencyIdToIso(raw.currency_id),
    emails: nonempty(buildEmails(raw.contacts)),
    telephones: nonempty(buildTelephones(raw.phone)),
    billingAddress: toAddress({
      address1: raw.address1,
      address2: raw.address2,
      city: raw.city,
      region: raw.state,
      postalCode: raw.postal_code,
      country: raw.country_id ? String(raw.country_id) : undefined,
    }),
    createdAt: parseEpoch(raw.created_at),
    updatedAt: parseEpoch(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
