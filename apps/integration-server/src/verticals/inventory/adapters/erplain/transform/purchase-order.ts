import { Iso4217Currency } from '@opensteward/shared'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import { pickNum, pickStr, requireId, strMap } from './shared'

/**
 * Erplain v2 `Purchase`, as selected by PURCHASE_FIELDS in ../index.ts.
 *
 * https://erplain.readme.io/v2.0/reference/purchases-queries, "Available fields":
 *   id              Int              "Unique identifier."
 *   label           String           "Purchase order number."
 *   status          PurchaseStatus   "Current status."
 *   delivery_status DeliveryStatus   "Physical reception progress."
 *   dated_at        Date             "Document date."
 *   shipping_at     Date             "Expected delivery date."
 *   created_at      DateTime         "Creation time."
 *   subtotal        Float            "Value before taxes and discounts."
 *   total           Float            "Grand total."
 *   currency        Currency         "Document currency."
 *   supplier        Supplier         "Linked supplier."
 *   location_label  String           "Source/Target location label."
 *   line_items      [LineItemPurchase] "List of items."
 *
 * Line items (https://erplain.readme.io/v2.0/reference/line-items-queries):
 *   id Int "Unique identifier of the line item.", quantity Float "Quantity of
 *   the line item.", variant Variant "Linked variant entity."; the variant's
 *   `product` is its "Parent product link."
 *   (https://erplain.readme.io/v2.0/reference/variants-queries).
 *   `price` is documented only as "Price of the line item.", which does not
 *   say whether it is per unit or for the line, so it is not mapped.
 *
 * Dates carry no zone ("Date (format : YYYY-MM-DD)", "Date and time (format :
 * YYYY-MM-DD HH:MM:SS)", https://erplain.readme.io/v2.0/reference/data-types),
 * so they go to metadata as sent rather than as guessed instants. The PO only
 * names its location by label, so destinationLocationId stays absent.
 */
export interface RawErplainPurchase {
  id: number | string
  label?: string | null
  status?: string | null
  delivery_status?: string | null
  dated_at?: string | null
  shipping_at?: string | null
  created_at?: string | null
  subtotal?: number | null
  total?: number | null
  location_label?: string | null
  currency?: { label?: string | null } | null
  supplier?: { id?: number | string | null } | null
  line_items?: Array<{
    id?: number | string | null
    quantity?: number | null
    variant?: {
      id?: number | string | null
      product?: { id?: number | string | null } | null
    } | null
  } | null> | null
}

/**
 * `PurchaseStatus` (purchases-queries, "Enums"):
 *   unpublished "Draft status (hidden).", draft "Document created, awaiting
 *   internal processing.", validation "Awaiting supervisor validation.",
 *   rejected "Document rejected by supervisor.", active "Published and
 *   confirmed.", completed "All items fully received and processed.",
 *   archived "Moved to long-term storage.", cancelled "Document voided."
 * `DeliveryStatus`: not_delivered, partially_delivered, delivered.
 */
function mapStatus(
  status: string | null | undefined,
  delivery: string | null | undefined,
): PurchaseOrderStatus {
  switch (status) {
    case 'unpublished':
    case 'draft':
      return 'draft'
    case 'active':
      if (delivery === 'partially_delivered') return 'partially_received'
      if (delivery === 'delivered') return 'received'
      return 'sent'
    case 'completed':
      return 'received'
    case 'archived':
      return 'closed'
    case 'cancelled':
      return 'cancelled'
    // validation / rejected have no canonical counterpart.
    default:
      return 'unknown'
  }
}

export function transformPurchaseOrder(raw: RawErplainPurchase): PurchaseOrder {
  const id = requireId(raw.id, 'purchase')
  const supplierId = requireId(raw.supplier?.id, `purchase ${id} supplier`)
  const currency = Iso4217Currency.safeParse(raw.currency?.label)

  const lines = (raw.line_items ?? []).map((l, i) => {
    const productId = requireId(l?.variant?.product?.id, `purchase ${id} line ${i} variant.product`)
    const quantity = pickNum(l?.quantity)
    if (quantity === undefined) throw new Error(`erplain purchase ${id} line ${i} has no quantity`)
    return { productId, quantityOrdered: quantity }
  })

  return {
    id,
    externalId: id,
    number: pickStr(raw.label),
    supplierId,
    status: mapStatus(raw.status, raw.delivery_status),
    currency: currency.success ? currency.data : undefined,
    subtotalAmount: pickNum(raw.subtotal),
    totalAmount: pickNum(raw.total),
    lines,
    platform: 'erplain',
    metadata: strMap({
      status: raw.status,
      delivery_status: raw.delivery_status,
      dated_at: raw.dated_at,
      shipping_at: raw.shipping_at,
      created_at: raw.created_at,
      location_label: raw.location_label,
    }),
    raw,
  }
}
