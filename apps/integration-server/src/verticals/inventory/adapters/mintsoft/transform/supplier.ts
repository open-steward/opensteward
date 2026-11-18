import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickBool, strMap} from './shared'

/**
 * Mintsoft ProductSupplier record as returned by GET /api/Product/Suppliers.
 *
 * Field names sourced from the Mintsoft Swagger spec ProductSupplier definition.
 * Note: phone is ContactNumber, email is ContactEmail, address uses AddressLine1/2/3,
 *       postal code is Postcode (lowercase 'c'), active status is Active (boolean).
 */
export interface RawMintsoftSupplier {
  ID: number
  Name?: string
  ContactName?: string
  ContactEmail?: string
  ContactNumber?: string
  AddressLine1?: string
  AddressLine2?: string
  AddressLine3?: string
  Town?: string
  County?: string
  Postcode?: string
  CountryId?: number
  ClientId?: number
  Active?: boolean
  CurrencyId?: number
  [key: string]: unknown
}

export function transformSupplier(raw: RawMintsoftSupplier): Supplier {
  const idStr = String(raw.ID)
  return {
    id: idStr,
    externalId: idStr,
    name: pickStr(raw.Name) ?? '',
    email: pickStr(raw.ContactEmail),
    phone: pickStr(raw.ContactNumber),
    defaultCurrency: undefined,
    defaultLeadTimeDays: undefined,
    isActive: pickBool(raw.Active) ?? true,
    platform: 'mintsoft',
    metadata: strMap({
      contactName: raw.ContactName,
      addressLine1: raw.AddressLine1,
      addressLine2: raw.AddressLine2,
      addressLine3: raw.AddressLine3,
      town: raw.Town,
      county: raw.County,
      postcode: raw.Postcode,
      clientId: raw.ClientId,
      currencyId: raw.CurrencyId,
    }),
    raw,
  }
}
