/**
 * Transform a Sellercloud vendor record.
 *
 * Source endpoint: GET /rest/api/Vendors
 * Docs: https://developer.sellercloud.com/dev-article/get-all-vendors/
 *
 * Key field mappings:
 *   ID        → id / externalId
 *   Name      → name
 *   Email     → email
 *   IsActive  → isActive
 *   Alias     → metadata.alias
 *   AccountNumber → metadata.accountNumber
 *   Website   → metadata.website
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawSellercloudVendor {
  ID: number | string
  Name?: string
  Email?: string
  EmailCC?: string
  IsActive?: boolean | number
  IsDefault?: boolean | number
  Alias?: string
  AccountNumber?: string
  Website?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawSellercloudVendor): Supplier {
  const id = String(raw.ID)

  // IsActive is a boolean in the Sellercloud vendor response
  const isActive =
    typeof raw.IsActive === 'boolean'
      ? raw.IsActive
      : raw.IsActive !== 0 && raw.IsActive != null

  return {
    id,
    externalId: id,
    name: pickStr(raw.Name) ?? '',
    email: pickStr(raw.Email),
    isActive,
    platform: 'sellercloud',
    metadata: strMap({
      alias: raw.Alias,
      accountNumber: raw.AccountNumber,
      website: raw.Website,
      emailCC: raw.EmailCC,
      isDefault: raw.IsDefault,
    }),
    raw,
  }
}
