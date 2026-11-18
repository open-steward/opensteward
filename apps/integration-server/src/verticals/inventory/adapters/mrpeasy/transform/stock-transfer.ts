import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * MRPeasy v1 does not expose a dedicated stock transfers endpoint.
 * This transform is provided for forward-compatibility if MRPeasy exposes
 * transfer data in a future API version or via a custom endpoint.
 *
 * Field names follow MRPeasy snake_case conventions.
 */
export interface RawMrpeasyStockTransfer {
  transfer_id: number | string
  code?: string
  from_site_id?: number | string
  to_site_id?: number | string
  status?: number | string
  items?: Array<{ article_id: number | string; quantity: number | string; received?: number | string }>
  ship_date?: number | string
  arrival_date?: number | string
  [key: string]: unknown
}

function mapStatus(s: number | string | undefined): StockTransferStatus {
  const code = Number(s ?? 0)
  switch (code) {
    case 5: return 'draft'
    case 10: return 'in_transit'
    case 20: return 'completed'
    case 30: return 'cancelled'
    default: return 'draft'
  }
}

function unixToIso(v: number | string | undefined): string | undefined {
  if (v == null) return undefined
  const n = Number(v)
  if (Number.isNaN(n) || n === 0) return undefined
  return new Date(n * 1000).toISOString()
}

export function transformStockTransfer(raw: RawMrpeasyStockTransfer): StockTransfer {
  const id = String(raw.transfer_id)
  return {
    id,
    externalId: id,
    number: pickStr(raw.code),
    fromLocationId: raw.from_site_id !== undefined ? String(raw.from_site_id) : '',
    toLocationId: raw.to_site_id !== undefined ? String(raw.to_site_id) : '',
    status: mapStatus(raw.status),
    lines: (raw.items ?? []).map((l) => ({
      productId: String(l.article_id),
      quantity: Number(l.quantity),
      quantityReceived: l.received !== undefined ? Number(l.received) : undefined,
    })),
    shippedAt: unixToIso(raw.ship_date) ?? toIso(raw.ship_date as string | undefined),
    receivedAt: unixToIso(raw.arrival_date) ?? toIso(raw.arrival_date as string | undefined),
    platform: 'mrpeasy',
    metadata: strMap({}),
    raw,
  }
}
