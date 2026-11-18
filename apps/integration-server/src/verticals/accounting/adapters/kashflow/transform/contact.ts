import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'
import { toIsoDatetime } from '@opensteward/shared'

/** Safely parse a KashFlow date string into a Date. Never throws. */
function toDate(val: unknown): Date | undefined {
  const iso = toIsoDatetime(val)
  return iso ? new Date(iso) : undefined
}

// KashFlow REST API v2 — Customers & Suppliers
// Docs: https://www.kashflow.com/developers/rest-api/api-customers/
//       https://www.kashflow.com/developers/rest-api/suppliers/

// ── Customer ──────────────────────────────────────────────────────────────────

export interface KashflowContactEntry {
  Email?: string
  Telephone?: string
  Mobile?: string
  Fax?: string
  Website?: string
  Firstname?: string
  LastName?: string
  Name?: string
  Title?: string
  [key: string]: unknown
}

export interface KashflowAddressEntry {
  Line1?: string
  Line2?: string
  Line3?: string
  Line4?: string
  PostCode?: string
  CountryCode?: string
  [key: string]: unknown
}

export interface KashflowCustomerCurrency {
  Code?: string
  [key: string]: unknown
}

export interface KashflowCustomer {
  Code?: string
  Name?: string
  DisplayName?: string
  Id?: number
  /** KashFlow REST API returns this field as VatNumber (not VATNumber) */
  VatNumber?: string
  Currency?: KashflowCustomerCurrency
  IsArchived?: boolean
  CreatedDate?: string
  LastUpdatedDate?: string
  // Contacts is an array; first entry holds primary contact info
  Contacts?: KashflowContactEntry[]
  Addresses?: KashflowAddressEntry | KashflowAddressEntry[]
  DeliveryAddresses?: KashflowAddressEntry | KashflowAddressEntry[]
  [key: string]: unknown
}

// ── Supplier ──────────────────────────────────────────────────────────────────

export interface KashflowSupplier {
  Code?: string
  Name?: string
  Id?: number
  VatNumber?: string
  IsArchived?: boolean
  CreatedDate?: string
  LastUpdatedDate?: string
  Contacts?: KashflowContactEntry[]
  Address?: KashflowAddressEntry
  Currency?: KashflowCustomerCurrency
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function firstAddress(
  addr?: KashflowAddressEntry | KashflowAddressEntry[],
): KashflowAddressEntry | undefined {
  if (!addr) return undefined
  return Array.isArray(addr) ? addr[0] : addr
}

function primaryContact(contacts?: KashflowContactEntry[]): KashflowContactEntry {
  return contacts?.[0] ?? {}
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformCustomer(raw: KashflowCustomer): Contact {
  const contact = primaryContact(raw.Contacts)
  const emails = toWorkEmail(contact.Email)
  const telephones: Telephone[] = []
  if (contact.Telephone) telephones.push({ telephone: contact.Telephone, type: 'WORK' })
  if (contact.Mobile) telephones.push({ telephone: contact.Mobile, type: 'MOBILE' })
  if (contact.Fax) telephones.push({ telephone: contact.Fax, type: 'FAX' })

  const billingRaw = firstAddress(raw.Addresses)
  const shippingRaw = firstAddress(raw.DeliveryAddresses)

  return {
    id: raw.Code ? `cust_${raw.Code}` : raw.Id !== undefined ? `cust_${raw.Id}` : undefined,
    name: raw.DisplayName || raw.Name || undefined,
    taxNumber: raw.VatNumber || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.IsArchived === true ? false : true,
    currency: raw.Currency?.Code || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: billingRaw?.Line1,
      address2: billingRaw?.Line2,
      city: billingRaw?.Line3,
      region: billingRaw?.Line4,
      postalCode: billingRaw?.PostCode,
      country: billingRaw?.CountryCode,
    }),
    shippingAddress: toAddress({
      address1: shippingRaw?.Line1,
      address2: shippingRaw?.Line2,
      city: shippingRaw?.Line3,
      region: shippingRaw?.Line4,
      postalCode: shippingRaw?.PostCode,
      country: shippingRaw?.CountryCode,
    }),
    createdAt: toDate(raw.CreatedDate),
    updatedAt: toDate(raw.LastUpdatedDate),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformSupplier(raw: KashflowSupplier): Contact {
  const contact = primaryContact(raw.Contacts)
  const emails = toWorkEmail(contact.Email)
  const telephones: Telephone[] = []
  if (contact.Telephone) telephones.push({ telephone: contact.Telephone, type: 'WORK' })
  if (contact.Mobile) telephones.push({ telephone: contact.Mobile, type: 'MOBILE' })
  if (contact.Fax) telephones.push({ telephone: contact.Fax, type: 'FAX' })

  const addr = raw.Address

  return {
    id: raw.Code ? `supp_${raw.Code}` : raw.Id !== undefined ? `supp_${raw.Id}` : undefined,
    name: raw.Name || undefined,
    taxNumber: raw.VatNumber || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.IsArchived === true ? false : true,
    currency: raw.Currency?.Code || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: addr?.Line1,
      address2: addr?.Line2,
      city: addr?.Line3,
      region: addr?.Line4,
      postalCode: addr?.PostCode,
      country: addr?.CountryCode,
    }),
    createdAt: toDate(raw.CreatedDate),
    updatedAt: toDate(raw.LastUpdatedDate),
    metadata: raw as Record<string, unknown>,
  }
}
