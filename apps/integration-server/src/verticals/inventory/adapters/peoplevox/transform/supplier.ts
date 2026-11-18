/**
 * Transform a Peoplevox "Supplier" GetData CSV row into a canonical Supplier.
 *
 * Template: "Supplier"
 * Key fields: Reference, Name, FirstName, LastName, Phone, Mobile, Email,
 *   CreditLimit, Notes, ExternalId,
 *   Address fields: AddressLine1, AddressCity, AddressRegion,
 *                   AddressPostcode, AddressCountry
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawPeoplevoxSupplier {
  /** Unique identifier — "Reference" field in Peoplevox */
  Reference: string
  Name?: string
  FirstName?: string
  LastName?: string
  Phone?: string
  Mobile?: string
  Email?: string
  CreditLimit?: string
  Notes?: string
  ExternalId?: string
  AddressLine1?: string
  AddressLine2?: string
  AddressCity?: string
  AddressRegion?: string
  AddressPostcode?: string
  AddressCountry?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawPeoplevoxSupplier): Supplier {
  const id = pickStr(raw.Reference) ?? pickStr(raw.ExternalId) ?? ''
  return {
    id,
    externalId: pickStr(raw.ExternalId) ?? id,
    name: pickStr(raw.Name) ?? (`${raw.FirstName ?? ''} ${raw.LastName ?? ''}`.trim() || id),
    email: pickStr(raw.Email),
    phone: pickStr(raw.Phone) ?? pickStr(raw.Mobile),
    defaultCurrency: undefined,
    defaultLeadTimeDays: undefined,
    isActive: true,
    platform: 'peoplevox',
    metadata: strMap({
      creditLimit: raw.CreditLimit,
      notes: raw.Notes,
      addressLine1: raw.AddressLine1,
      addressCity: raw.AddressCity,
      addressCountry: raw.AddressCountry,
    }),
    raw,
  }
}
