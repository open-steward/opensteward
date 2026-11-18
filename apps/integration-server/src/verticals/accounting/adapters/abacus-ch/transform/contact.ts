/**
 * Transform Abacus ERP address/contact records to the canonical Contact schema.
 *
 * Abacus stores all contacts (customers, suppliers, employees, etc.) in a
 * unified "Addresses" entity set. The contact type is indicated by the
 * SubjectType or RoleType field.
 *
 * Key Abacus address fields:
 *   Id             – numeric string primary key
 *   FirstName      – given name
 *   LastName       – family name (or company identifier)
 *   Company        – company / organisation name
 *   AddressType    – "Natural" | "Legal" (natural person vs. legal entity)
 *   IsActive       – boolean
 *   IsDebtor       – true when this address is used as a debtor (customer)
 *   IsCreditor     – true when this address is used as a creditor (supplier)
 *   Email          – primary email address string
 *   Phone          – primary phone string
 *   Street         – street line 1
 *   Street2        – street line 2
 *   City           – city
 *   ZipCode        – postal code
 *   CountryCode    – ISO 3166-1 alpha-2
 *   CurrencyCode   – ISO 4217 default currency
 *   VatNumber      – VAT / UID number
 *   CreatedAt / ModifiedAt – ISO datetime strings
 */

import type { Contact } from '../../../schema/contact'
import type { Email, Telephone, Address } from '../../../schema/shared'

// ── Abacus payload type ───────────────────────────────────────────────────────

export interface AbacusAddress {
  Id: string | number
  FirstName?: string
  LastName?: string
  Company?: string
  AddressType?: string        // "Natural" | "Legal"
  IsActive?: boolean
  IsDebtor?: boolean
  IsCreditor?: boolean
  Email?: string
  Phone?: string
  MobilePhone?: string
  Street?: string
  Street2?: string
  City?: string
  ZipCode?: string
  CountryCode?: string
  CurrencyCode?: string
  VatNumber?: string
  CreatedAt?: string
  ModifiedAt?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: AbacusAddress): Address | undefined {
  if (!raw.Street && !raw.City && !raw.ZipCode && !raw.CountryCode) return undefined
  return {
    address1: raw.Street || undefined,
    address2: raw.Street2 || undefined,
    city: raw.City || undefined,
    postalCode: raw.ZipCode || undefined,
    country: raw.CountryCode || undefined,
  }
}

function mapEmails(raw: AbacusAddress): Email[] {
  if (!raw.Email) return []
  return [{ email: raw.Email, type: 'WORK' }]
}

function mapTelephones(raw: AbacusAddress): Telephone[] {
  const out: Telephone[] = []
  if (raw.Phone) out.push({ telephone: raw.Phone, type: 'WORK' })
  if (raw.MobilePhone) out.push({ telephone: raw.MobilePhone, type: 'MOBILE' })
  return out
}

/** Derive a human-readable display name from the address record. */
function displayName(raw: AbacusAddress): string | undefined {
  if (raw.Company) return raw.Company
  const parts = [raw.FirstName, raw.LastName].filter(Boolean)
  return parts.length ? parts.join(' ') : undefined
}

// ── Main transform ────────────────────────────────────────────────────────────

/** Convert an Abacus address OData record to the canonical Contact type. */
export function transformContact(raw: AbacusAddress): Contact {
  const emails = mapEmails(raw)
  const telephones = mapTelephones(raw)
  const address = mapAddress(raw)

  return {
    id: String(raw.Id),
    name: displayName(raw),
    firstName: raw.FirstName || undefined,
    lastName: raw.LastName || undefined,
    companyName: raw.Company || undefined,
    taxNumber: raw.VatNumber || undefined,
    isCustomer: raw.IsDebtor ?? false,
    isSupplier: raw.IsCreditor ?? false,
    isActive: raw.IsActive ?? true,
    currency: raw.CurrencyCode || undefined,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress: address,
    createdAt: raw.CreatedAt ? new Date(raw.CreatedAt) : undefined,
    updatedAt: raw.ModifiedAt ? new Date(raw.ModifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Convert a partial canonical Contact to an Abacus create/update payload. */
export function untransformContact(contact: Partial<Contact>): Record<string, unknown> {
  return {
    FirstName: contact.firstName,
    LastName: contact.lastName,
    Company: contact.companyName,
    Email: contact.emails?.[0]?.email,
    Phone: contact.telephones?.find((t) => t.type === 'WORK' || !t.type)?.telephone,
    MobilePhone: contact.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
    Street: contact.billingAddress?.address1,
    Street2: contact.billingAddress?.address2,
    City: contact.billingAddress?.city,
    ZipCode: contact.billingAddress?.postalCode,
    CountryCode: contact.billingAddress?.country,
    CurrencyCode: contact.currency,
    VatNumber: contact.taxNumber,
    IsDebtor: contact.isCustomer,
    IsCreditor: contact.isSupplier,
  }
}
