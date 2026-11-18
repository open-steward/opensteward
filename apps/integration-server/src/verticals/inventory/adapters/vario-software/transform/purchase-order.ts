/**
 * Transform a VARIO Cloud order-proposal (GET /erp/order-proposals/{id})
 * into the canonical PurchaseOrder schema.
 *
 * Order proposals are the closest VARIO equivalent to a purchase order —
 * they represent replenishment proposals that can be converted to orders
 * via POST /erp/order-proposals/{id}/perform-create-orders.
 *
 * Field mapping:
 *   id                           → id / externalId
 *   processed                    → status (false=draft, true=closed)
 *   orderProposalSuppliers[0].accountId → supplierId
 *   orderProposalLines            → lines
 *   lines[].proposedOrderAmount  → quantityOrdered
 *   lines[].toBeOrderedAmount    → quantityOrdered (preferred)
 *   lines[].negotiatedUnitPrice  → unitCost
 *   info.createdAt               → orderedAt
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

interface VarioRef { id?: string | number; displayName?: string }

interface VarioOrderProposalLine {
  id?: string | number
  articleRef?: VarioRef
  proposedOrderAmount?: number
  toBeOrderedAmount?: number
  negotiatedUnitPrice?: number
  determinedUnitPrice?: number
}

interface VarioOrderProposalSupplier {
  id?: string | number
  accountRef?: VarioRef
  accountId?: string
}

interface VarioMetaInfo {
  createdAt?: string
  updatedAt?: string
}

export interface RawVarioOrderProposal {
  id?: string | number
  version?: string
  processed?: boolean
  supplierPreference?: string
  orderProposalSuppliers?: VarioOrderProposalSupplier[]
  orderProposalLines?: VarioOrderProposalLine[]
  info?: VarioMetaInfo
  [key: string]: unknown
}

function mapStatus(processed: boolean | undefined): PurchaseOrderStatus {
  return processed ? 'closed' : 'draft'
}

export function transformPurchaseOrder(raw: RawVarioOrderProposal): PurchaseOrder {
  const id = String(raw.id ?? '')

  const firstSupplier = raw.orderProposalSuppliers?.[0]
  const supplierId =
    pickStr(firstSupplier?.accountId) ??
    pickStr(firstSupplier?.accountRef?.id) ??
    ''

  const lines = (raw.orderProposalLines ?? []).map((l) => ({
    productId: String(l.articleRef?.id ?? ''),
    quantityOrdered: l.toBeOrderedAmount ?? l.proposedOrderAmount ?? 0,
    quantityReceived: undefined,
    unitCost: l.negotiatedUnitPrice ?? l.determinedUnitPrice,
    lineTotal: undefined,
  }))

  return {
    id,
    externalId: id,
    number: undefined,
    supplierId,
    destinationLocationId: undefined,
    status: mapStatus(raw.processed),
    currency: undefined,
    subtotalAmount: undefined,
    totalAmount: undefined,
    lines,
    expectedAt: undefined,
    orderedAt: toIso(raw.info?.createdAt),
    receivedAt: undefined,
    platform: 'vario-software',
    metadata: strMap({
      supplierPreference: raw.supplierPreference,
      version: raw.version,
    }),
    raw,
  }
}
