/**
 * Oracle WMS Cloud — inventory entity → StockLevel
 *
 * lgfapi endpoint: GET /wms/lgfapi/v10/entity/inventory/
 *
 * Key inventory fields:
 *   inventory_id       — internal PK
 *   item_id            — FK to item
 *   location_id        — FK to location
 *   qty_on_hand        — quantity physically on hand
 *   qty_allocated      — quantity committed/allocated to orders
 *   qty_in_receipt     — quantity in receiving (incoming)
 *   lot_number         — lot/batch number (nullable)
 *   serial_number      — serial number (nullable)
 *   last_inv_date      — last inventory count date
 *   company_id         — tenant company FK
 *
 * Note: Oracle WMS does not expose a single-inventory-record GET by compound key;
 * stock levels are always fetched in bulk with filters (item_id, location_id).
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

export interface RawOracleWmsInventory {
  inventory_id?: number | string
  item_id: number | string
  location_id?: number | string
  qty_on_hand?: number | string
  qty_allocated?: number | string
  qty_in_receipt?: number | string
  lot_number?: string
  serial_number?: string
  last_inv_date?: string
  company_id?: number | string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawOracleWmsInventory): StockLevel {
  const productId = String(raw.item_id)
  const locationId = raw.location_id !== undefined ? String(raw.location_id) : ''
  const id = raw.inventory_id !== undefined
    ? String(raw.inventory_id)
    : `${productId}:${locationId}`

  const onHand = pickNum(raw.qty_on_hand) ?? 0
  const allocated = pickNum(raw.qty_allocated)
  const inReceipt = pickNum(raw.qty_in_receipt)
  const available = allocated !== undefined ? onHand - allocated : undefined

  return {
    id,
    productId,
    locationId,
    quantityOnHand: onHand,
    quantityAvailable: available,
    quantityCommitted: allocated,
    quantityIncoming: inReceipt,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: toIso(raw.last_inv_date),
    platform: 'oracle-wms',
    metadata: strMap({
      lotNumber: raw.lot_number,
      serialNumber: raw.serial_number,
      companyId: raw.company_id,
    }),
    raw,
  }
}
