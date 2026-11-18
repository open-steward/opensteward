/**
 * Maps an Orderful v3 transaction of type 850_PURCHASE_ORDER to the
 * canonical PurchaseOrder schema.
 *
 * The Orderful Mosaic 850 message nests order fields under:
 *   transaction.message.heading  — order header (purchaseOrderNumber, dates, parties, currency)
 *   transaction.message.detail   — line items array
 *
 * Delivery/acknowledgment status is surfaced at the transaction level.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import { pickStr, pickNum, strMap, toIso } from './shared'

/** Top-level Orderful transaction envelope (v3). */
export interface RawOrderfulTransaction {
  id: string | number
  type?: { name?: string }
  stream?: string
  businessNumber?: string
  sender?: { ediAccountId?: number; organizationName?: string; liveIsaId?: string }
  receiver?: { ediAccountId?: number; organizationName?: string; liveIsaId?: string }
  validationStatus?: string
  deliveryStatus?: string
  acknowledgmentStatus?: string
  createdAt?: string
  lastUpdatedAt?: string
  message?: RawOrderful850Message
  [key: string]: unknown
}

/** Mosaic 850 purchase-order message. */
export interface RawOrderful850Message {
  heading?: {
    purchaseOrderNumber?: string
    purchaseOrderDate?: string
    purpose?: string
    purchaseOrderType?: string
    buyersCurrency?: { code?: string }
    parties?: {
      buyer?: { organizationName?: string; entityId?: string }
      supplier?: { organizationName?: string; entityId?: string }
      shipTo?: { organizationName?: string; entityId?: string; address?: RawOrderfulAddress }
    }
    dates?: Array<{ qualifier?: string; date?: string }>
    monetaryAmounts?: Array<{ qualifier?: string; amount?: number }>
  }
  detail?: Array<{
    purchaseOrderLineId?: string | number
    quantity?: { value?: number; unitOfMeasure?: string }
    unitCostPrice?: number
    productIds?: {
      buyerItemNumber?: string
      vendorItemNumber?: string
      gtin?: string
      caseCode?: string
    }
    productAttributes?: { description?: string }
  }>
}

interface RawOrderfulAddress {
  streetAddress?: string
  city?: string
  stateOrProvince?: string
  country?: string
  postalCode?: string
}

function mapDeliveryStatus(deliveryStatus?: string, ackStatus?: string): PurchaseOrderStatus {
  const d = (deliveryStatus ?? '').toUpperCase()
  const a = (ackStatus ?? '').toUpperCase()
  if (d === 'FAILED') return 'cancelled'
  if (a === 'REJECTED') return 'cancelled'
  if (a === 'ACCEPTED' || a === 'ACCEPTED_WITH_ERRORS') return 'received'
  if (d === 'DELIVERED') return 'sent'
  if (d === 'SENT') return 'sent'
  if (d === 'PENDING') return 'draft'
  return 'draft'
}

export function transformPurchaseOrder(raw: RawOrderfulTransaction): PurchaseOrder {
  const msg = (raw.message ?? {}) as RawOrderful850Message
  const heading = msg.heading ?? {}
  const lines = msg.detail ?? []

  const currency = heading.buyersCurrency?.code

  // Extract total from monetaryAmounts array (qualifier 'TT' = transaction total)
  const totalEntry = (heading.monetaryAmounts ?? []).find(
    (m) => (m.qualifier ?? '').toUpperCase() === 'TT',
  )
  const totalAmount = totalEntry?.amount !== undefined ? pickNum(totalEntry.amount) : undefined

  // Supplier comes from transaction sender (EDI trading partner sending the PO)
  const supplierId = String(raw.sender?.ediAccountId ?? raw.sender?.liveIsaId ?? '')

  // Ship-to becomes destination location
  const shipTo = heading.parties?.shipTo
  const destinationLocationId = shipTo?.entityId ?? shipTo?.organizationName

  // Expected delivery date from dates array (qualifier 'DEL' or '002' = delivery)
  const deliveryDate = (heading.dates ?? []).find((d) =>
    ['DEL', '002', 'DELIVERY'].includes((d.qualifier ?? '').toUpperCase()),
  )
  const orderedDate = (heading.dates ?? []).find((d) =>
    ['004', 'PO', 'ORDER'].includes((d.qualifier ?? '').toUpperCase()),
  )

  const id = String(raw.id)

  return {
    id,
    externalId: id,
    number: pickStr(heading.purchaseOrderNumber) ?? pickStr(raw.businessNumber),
    supplierId,
    destinationLocationId: pickStr(destinationLocationId),
    status: mapDeliveryStatus(raw.deliveryStatus, raw.acknowledgmentStatus),
    currency: pickStr(currency),
    totalAmount,
    lines: lines.map((l) => ({
      productId:
        l.productIds?.buyerItemNumber ??
        l.productIds?.vendorItemNumber ??
        l.productIds?.gtin ??
        String(l.purchaseOrderLineId ?? ''),
      quantityOrdered: l.quantity?.value ?? 0,
      unitCost: pickNum(l.unitCostPrice),
      lineTotal:
        l.unitCostPrice !== undefined && l.quantity?.value !== undefined
          ? l.unitCostPrice * l.quantity.value
          : undefined,
    })),
    expectedAt: toIso(deliveryDate?.date),
    orderedAt: toIso(orderedDate?.date ?? heading.purchaseOrderDate),
    platform: 'orderful',
    metadata: strMap({
      transactionType: raw.type?.name,
      stream: raw.stream,
      validationStatus: raw.validationStatus,
      deliveryStatus: raw.deliveryStatus,
      acknowledgmentStatus: raw.acknowledgmentStatus,
      purchaseOrderType: heading.purchaseOrderType,
      purpose: heading.purpose,
    }),
    raw,
  }
}
