/**
 * Transform a 3PL Central supplier identifier (supplierIdentifier embedded inside
 * inventory/stockdetails records) into a canonical Supplier.
 *
 * 3PL Central does not expose a dedicated /suppliers REST endpoint in the public
 * API. Supplier data surfaces as embedded objects within inventory and receiver
 * records: supplierIdentifier: { name: string, id: number }.
 *
 * We synthesise a minimal Supplier from these embedded identifiers.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface Raw3plCentralSupplierIdentifier {
  /** supplier integer id from 3PL Central */
  id?: number
  name?: string
  [key: string]: unknown
}

export function transformSupplier(raw: Raw3plCentralSupplierIdentifier): Supplier {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    email: undefined,
    phone: undefined,
    defaultCurrency: undefined,
    defaultLeadTimeDays: undefined,
    isActive: true,
    platform: '3plcentral',
    metadata: strMap({ supplierId: raw.id }),
    raw,
  }
}
