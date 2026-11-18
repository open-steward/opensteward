/**
 * iQmetrix Supplier Availability API — supplier transform.
 *
 * Source: GET /Suppliers({SupplierId})/SupplierSkus
 *         (Supplier Inventory Availability API — availabilityrc.iqmetrix.net)
 *
 * The supplier availability API surfaces individual supplier records keyed by
 * SupplierEntityId. We synthesise a supplier record from these fields since
 * iQmetrix does not expose a standalone supplier-list endpoint accessible to
 * retailers. The entity manager identifies supplier entities with an integer Id.
 *
 * Key fields (from SupplierProductAvailability schema):
 *   Id               — availability record UUID (not the supplier ID)
 *   SupplierEntityId — integer, the supplier's entity ID (our supplier id)
 *   SupplierSku      — SKU used by supplier
 *   IsAvailable      — boolean
 *   Quantity         — approximate stock count
 *   LastModifiedDateUtc
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

/**
 * Minimal supplier record synthesised from the iQmetrix Entity Manager
 * Companies API. iQmetrix partners/suppliers appear as company entities.
 *
 * Source: GET /Companies({CompanyId})/Relationships/Vendors (entity-manager API)
 */
export interface RawIqmetrixSupplierEntity {
  Id: number | string
  Name?: string
  DisplayName?: string
  Description?: string
  CreatedUtc?: string
  LastModifiedUtc?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawIqmetrixSupplierEntity): Supplier {
  const id = String(raw.Id)
  return {
    id,
    externalId:  id,
    name:        pickStr(raw.Name) ?? pickStr(raw.DisplayName) ?? '',
    isActive:    true,
    platform:    'iqmetrix',
    metadata: strMap({ description: raw.Description }),
    raw,
  }
}
