/**
 * GoFrugal RetailEasy supplier transform.
 *
 * GoFrugal's public WebReporter API (api/v1) does not expose a supplier
 * listing endpoint. This file is kept as a placeholder for future use if
 * GoFrugal adds supplier endpoints. The adapter does NOT implement
 * listSuppliers / getSupplier.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawGofrugalSupplier {
  supplierId: number | string
  supplierName?: string
  email?: string
  phone?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawGofrugalSupplier): Supplier {
  const id = String(raw.supplierId)
  return {
    id,
    externalId: id,
    name: pickStr(raw.supplierName) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: undefined,
    defaultLeadTimeDays: undefined,
    isActive: true,
    platform: 'gofrugal',
    metadata: strMap({}),
    raw,
  }
}
