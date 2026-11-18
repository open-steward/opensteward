/**
 * Kladana stock transfer (move) transform.
 *
 * Source: /entity/move
 * Key fields:
 *   id          — UUID
 *   name        — document number
 *   sourceStore — origin warehouse reference
 *   targetStore — destination warehouse reference
 *   applicable  — true = posted/confirmed
 *   moment      — document date
 *   created     — creation timestamp
 *   updated     — last modification
 *
 * Positions rows contain:
 *   assortment.meta.href — product reference
 *   quantity             — quantity being transferred
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

interface KladanaMeta { href?: string }
interface KladanaRef { meta?: KladanaMeta }
interface KladanaMovePosition {
  assortment?: KladanaRef
  quantity?: number
  [key: string]: unknown
}

export interface RawKladanaStockTransfer {
  id: string
  name?: string
  sourceStore?: KladanaRef
  targetStore?: KladanaRef
  applicable?: boolean
  moment?: string
  created?: string
  updated?: string
  positions?: { rows?: KladanaMovePosition[] }
  [key: string]: unknown
}

function extractId(ref: KladanaRef | undefined): string {
  const href = ref?.meta?.href ?? ''
  const parts = href.split('/')
  return parts[parts.length - 1] ?? ''
}

function mapStatus(applicable: boolean | undefined): StockTransferStatus {
  return applicable ? 'completed' : 'draft'
}

export function transformStockTransfer(raw: RawKladanaStockTransfer): StockTransfer {
  const positionRows = raw.positions?.rows ?? []
  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.name),
    fromLocationId: extractId(raw.sourceStore),
    toLocationId: extractId(raw.targetStore),
    status: mapStatus(raw.applicable),
    lines: positionRows.map((l) => ({
      productId: extractId(l.assortment),
      quantity: l.quantity ?? 0,
    })),
    shippedAt: toIso(raw.moment),
    platform: 'kladana',
    metadata: strMap({}),
    raw,
  }
}
