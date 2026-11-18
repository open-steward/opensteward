/**
 * Transform a Datapel Breeze `inventorylist` record into the canonical
 * StockLevel shape.
 *
 * Field mapping based on the ccBreezeSDK Inventory domain model:
 *   basestockid   — product ID
 *   itemnumber    — product item code (secondary reference)
 *   locationid    — warehouse location ID
 *   quantity      — total on hand
 *   availqty      — available (unallocated)
 *   committed     — committed / allocated
 *   intransitqty  — in transit
 *   onorder       — on order (incoming)
 *   allocatedqty  — allocated to outbound orders
 *   onhold        — on hold
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

export interface RawDatapelInventory {
  basestockid?: number | string
  itemnumber?: string
  itemname?: string
  locationid?: number | string
  quantity?: number | string
  availqty?: number | string
  committed?: number | string
  intransitqty?: number | string
  onorder?: number | string
  allocatedqty?: number | string
  onhold?: number | string
  approveqty?: number | string
  shippedqty?: number | string
  worcommit?: number | string
  [key: string]: unknown
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v !== '') {
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return 0
}

function toNumOpt(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isNaN(n) ? undefined : n
}

export function transformStockLevel(raw: RawDatapelInventory): StockLevel {
  const productId = String(raw.basestockid ?? '')
  const locationId = String(raw.locationid ?? '')
  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: toNum(raw.quantity),
    quantityAvailable: toNumOpt(raw.availqty),
    quantityCommitted: toNumOpt(raw.committed),
    quantityIncoming: toNumOpt(raw.onorder),
    platform: 'datapel',
    metadata: strMap({
      allocatedqty: raw.allocatedqty,
      onhold: raw.onhold,
      intransitqty: raw.intransitqty,
      approveqty: raw.approveqty,
      shippedqty: raw.shippedqty,
      worcommit: raw.worcommit,
      itemnumber: raw.itemnumber,
    }),
    raw,
  }
}
