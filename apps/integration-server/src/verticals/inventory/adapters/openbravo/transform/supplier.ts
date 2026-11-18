/**
 * Openbravo BusinessPartner (vendor) → canonical Supplier.
 *
 * Entity: BusinessPartner (table: C_BPartner)
 * Endpoint: /openbravo/org.openbravo.service.json.jsonrest/BusinessPartner
 *            ?_where=vendor='Y'
 *
 * Fields used:
 *   id, searchKey (code), name, active, vendor (Y/N flag),
 *   email, phone, currency._identifier, purchaseLeadtime,
 *   purchasePricelist._identifier, creationDate, updated
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawOpenbravoBusinessPartner {
  /** UUID primary key */
  id: string
  /** Internal search key / code */
  searchKey?: string
  name?: string
  /** "Y" = active */
  active?: boolean | string
  /** "Y" = is a vendor/supplier */
  vendor?: boolean | string
  email?: string
  phone?: string
  /** Default purchase currency */
  currency?: { _identifier?: string }
  /** Purchase lead time in days */
  purchaseLeadtime?: number | string
  purchasePricelist?: { id?: string; _identifier?: string }
  creationDate?: string
  updated?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawOpenbravoBusinessPartner): Supplier {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency?._identifier),
    defaultLeadTimeDays: pickNum(raw.purchaseLeadtime),
    isActive: (pickBool(raw.active) ?? true) && (pickBool(raw.vendor) ?? true),
    platform: 'openbravo',
    metadata: strMap({
      searchKey: raw.searchKey,
      pricelistId: raw.purchasePricelist?.id,
      creationDate: toIso(raw.creationDate),
      updated: toIso(raw.updated),
    }),
    raw,
  }
}
