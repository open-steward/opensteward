/**
 * Kladana purchase order transform.
 *
 * Source: /entity/purchaseorder
 * Key fields:
 *   id            — UUID
 *   name          — document number
 *   agent         — supplier reference (meta.href ends with UUID)
 *   store         — destination warehouse reference
 *   applicable    — true = posted/confirmed
 *   sum           — total in kopecks (integer minor units) — pass through
 *   vatSum        — VAT portion in kopecks
 *   moment        — document date
 *   created       — creation timestamp
 *   updated       — last modification
 *   deliveryPlannedMoment — expected delivery date
 *
 * Positions: fetched separately via /entity/purchaseorder/{id}/positions
 * For list calls we store positions = [] and let getters resolve them.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

interface KladanaMeta { href?: string }
interface KladanaRef { meta?: KladanaMeta }
interface KladanaPosition {
  assortment?: KladanaRef
  quantity?: number
  shipped?: number
  price?: number
  sum?: number
}

export interface RawKladanaPurchaseOrder {
  id: string
  name?: string
  agent?: KladanaRef
  store?: KladanaRef
  applicable?: boolean
  sum?: number
  vatSum?: number
  moment?: string
  created?: string
  updated?: string
  deliveryPlannedMoment?: string
  positions?: { rows?: KladanaPosition[] }
  [key: string]: unknown
}

function extractId(ref: KladanaRef | undefined): string {
  const href = ref?.meta?.href ?? ''
  const parts = href.split('/')
  return parts[parts.length - 1] ?? ''
}

function mapStatus(applicable: boolean | undefined): PurchaseOrderStatus {
  // Kladana uses `applicable` (posted/confirmed = true) but has no native sub-states
  // exposed in the list payload. We map posted -> sent, unposted -> draft.
  return applicable ? 'sent' : 'draft'
}

export function transformPurchaseOrder(raw: RawKladanaPurchaseOrder): PurchaseOrder {
  const positionRows = raw.positions?.rows ?? []
  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.name),
    supplierId: extractId(raw.agent),
    destinationLocationId: extractId(raw.store) || undefined,
    status: mapStatus(raw.applicable),
    // sum is already in integer minor units (kopecks)
    totalAmount: raw.sum !== undefined ? Math.round(raw.sum) : undefined,
    lines: positionRows.map((l) => ({
      productId: extractId(l.assortment),
      quantityOrdered: l.quantity ?? 0,
      quantityReceived: l.shipped,
      // price in kopecks = integer minor unit
      unitCost: l.price !== undefined ? Math.round(l.price) : undefined,
      lineTotal: l.sum !== undefined ? Math.round(l.sum) : undefined,
    })),
    orderedAt: toIso(raw.moment),
    expectedAt: toIso(raw.deliveryPlannedMoment),
    platform: 'kladana',
    metadata: strMap({ vatSum: raw.vatSum !== undefined ? String(raw.vatSum) : undefined }),
    raw,
  }
}
