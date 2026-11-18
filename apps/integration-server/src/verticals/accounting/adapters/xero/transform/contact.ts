import type { Contact } from '../../../schema/contact'
import type { Telephone, Address } from '../../../schema/shared'
import { toUtcDate, toWorkEmail, nonempty, toAddress } from '../../shared/transform'

export interface XeroPhone {
  PhoneType: 'DEFAULT' | 'DDI' | 'MOBILE' | 'FAX'
  PhoneNumber: string
  PhoneAreaCode: string
  PhoneCountryCode: string
}

export interface XeroAddress {
  AddressType: 'POBOX' | 'STREET'
  AddressLine1: string
  AddressLine2: string
  City: string
  PostalCode: string
  Country: string
}

export interface XeroContact {
  ContactID: string
  Name: string
  FirstName: string
  LastName: string
  IsCustomer: boolean
  IsSupplier: boolean
  ContactStatus: 'ACTIVE' | 'ARCHIVED'
  EmailAddress: string
  TaxNumber: string
  DefaultCurrency: string
  Phones: XeroPhone[]
  Addresses: XeroAddress[]
  /** Xero's last-modified instant. A real moment, not a calendar date. */
  UpdatedDateUTC?: string
  [key: string]: unknown
}

function mapPhones(phones: XeroPhone[]): Telephone[] {
  return (phones ?? [])
    .filter((p) => p.PhoneNumber)
    .map((p) => ({
      telephone: [p.PhoneCountryCode, p.PhoneAreaCode, p.PhoneNumber].filter(Boolean).join(''),
      type: p.PhoneType === 'FAX' ? ('FAX' as const) : ('WORK' as const),
    }))
}

function mapAddresses(addresses: XeroAddress[]): { billing?: Address; shipping?: Address } {
  const pobox = addresses?.find((a) => a.AddressType === 'POBOX')
  const street = addresses?.find((a) => a.AddressType === 'STREET')
  // `toAddress` (not a local object literal) because it returns undefined when
  // every field is falsy. Xero sends entries carrying only a type
  // discriminator — `{ "AddressType": "STREET" }` with no address at all — and
  // building an object for those emitted `shippingAddress: {}`, which asserts
  // a known-empty address where the truth is that the platform said nothing.
  const toAddr = (a: XeroAddress | undefined): Address | undefined =>
    a
      ? toAddress({
          address1: a.AddressLine1,
          address2: a.AddressLine2,
          city: a.City,
          postalCode: a.PostalCode,
          country: a.Country,
        })
      : undefined
  return { billing: toAddr(pobox ?? street), shipping: toAddr(street) }
}

export function transformContact(raw: XeroContact): Contact {
  const emails = toWorkEmail(raw.EmailAddress)
  const telephones = mapPhones(raw.Phones ?? [])
  const { billing, shipping } = mapAddresses(raw.Addresses ?? [])

  return {
    id: raw.ContactID,
    name: raw.Name || undefined,
    firstName: raw.FirstName || undefined,
    lastName: raw.LastName || undefined,
    taxNumber: raw.TaxNumber || undefined,
    isCustomer: raw.IsCustomer,
    isSupplier: raw.IsSupplier,
    isActive: raw.ContactStatus === 'ACTIVE',
    currency: raw.DefaultCurrency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: billing,
    shippingAddress: shipping,
    // A genuine instant, so NOT routed through toCalendarDate. This is the
    // value `updated_after` filters on, and truncating it to a date would
    // reopen the incremental-sync gap it exists to close.
    updatedAt: toUtcDate(raw.UpdatedDateUTC),
    metadata: raw as Record<string, unknown>,
  }
}
