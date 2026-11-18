/**
 * Directo contact transforms — customers and suppliers.
 *
 * Endpoints:
 *   GET /v1/customers
 *   GET /v1/suppliers
 *
 * Field names follow Directo's snake_case convention (consistent with xmlcore).
 */
import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

// ── Directo wire types ────────────────────────────────────────────────────────

export interface DirectoCustomer {
  code?: string        // unique customer code
  name?: string        // customer display name
  email?: string       // primary email
  phone?: string       // phone number
  address1?: string    // street address line 1
  address2?: string    // street address line 2
  address3?: string    // street address line 3 (city in some setups)
  country?: string     // ISO-3166 country code
  vatregno?: string    // VAT registration number
  regno?: string       // company registration number
  currency?: string    // default currency
  closed?: boolean | number  // 0/false = active, 1/true = closed
  type?: number | string     // 0=company, 1=individual, 2=government
  [key: string]: unknown
}

export interface DirectoSupplier {
  code?: string        // unique supplier code
  name?: string        // supplier display name
  email?: string       // primary email
  phone?: string       // phone number
  contact?: string     // contact person name
  address1?: string
  address2?: string
  address3?: string
  country?: string
  vatregno?: string    // VAT registration number
  regno?: string       // registration number
  bankaccount?: string // bank account details
  currency?: string    // default currency
  closed?: boolean | number
  [key: string]: unknown
}

// ── Public transforms ─────────────────────────────────────────────────────────

export function transformCustomer(raw: DirectoCustomer): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  const isActive = raw.closed === undefined ? undefined : !raw.closed

  return {
    id: raw.code ? `cust_${raw.code}` : undefined,
    name: raw.name || undefined,
    identification: raw.regno || undefined,
    taxNumber: raw.vatregno || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address1,
      address2: raw.address2,
      city: raw.address3,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformSupplier(raw: DirectoSupplier): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  const isActive = raw.closed === undefined ? undefined : !raw.closed

  return {
    id: raw.code ? `supp_${raw.code}` : undefined,
    name: raw.name || undefined,
    identification: raw.regno || undefined,
    taxNumber: raw.vatregno || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address1,
      address2: raw.address2,
      city: raw.address3,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
