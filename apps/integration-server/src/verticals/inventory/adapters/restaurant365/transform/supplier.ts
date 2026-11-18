/**
 * Transform Restaurant365 OData `Company` entity -> canonical Supplier.
 *
 * R365 OData schema (https://odata.restaurant365.net/api/v2/views/Company):
 *   companyId      Guid   — primary key
 *   name           String — vendor / company display name
 *   companyNumber  String — vendor code
 *   comment        String — free-text notes
 *   createdBy      String
 *   createdOn      DateTimeOffset
 *   modifiedBy     String
 *   modifiedOn     DateTimeOffset
 *
 * R365 does not expose email, phone, or currency at the OData level.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawR365Company {
  companyId: string
  name?: string
  companyNumber?: string
  comment?: string
  createdBy?: string
  createdOn?: string
  modifiedBy?: string
  modifiedOn?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawR365Company): Supplier {
  return {
    id: raw.companyId,
    externalId: raw.companyId,
    name: pickStr(raw.name) ?? '',
    email: undefined,
    phone: undefined,
    defaultCurrency: undefined,
    defaultLeadTimeDays: undefined,
    isActive: true,
    platform: 'restaurant365',
    metadata: strMap({
      companyNumber: raw.companyNumber,
      comment: raw.comment,
      createdBy: raw.createdBy,
      modifiedBy: raw.modifiedBy,
    }),
    raw,
  }
}
