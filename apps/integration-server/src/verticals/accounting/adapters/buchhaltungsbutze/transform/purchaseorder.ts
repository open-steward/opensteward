import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder';
import type { Lineitem } from '../../../schema/shared';

export interface BuchhaltungsbutzePurchaseOrderItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  gross?: number;
  [key: string]: unknown;
}

export interface BuchhaltungsbutzePurchaseOrder {
  id: string | number;
  date?: string;
  due_date?: string;
  total?: number;
  status?: string;
  supplier_id?: string | number;
  items?: BuchhaltungsbutzePurchaseOrderItem[];
  [key: string]: unknown;
}

function toPurchaseOrderStatus(status: string | undefined): PurchaseOrderStatus {
  switch (status) {
    case 'draft': return 'DRAFT';
    case 'open': return 'ACTIVE';
    case 'paid': return 'COMPLETED';
    case 'cancelled': return 'CANCELLED';
    default: return 'DRAFT';
  }
}

export function transformPurchaseOrder(raw: BuchhaltungsbutzePurchaseOrder): PurchaseOrder {
  const lineItems: Lineitem[] = (raw.items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unit_price,
    totalAmount: item.gross,
    metadata: item as Record<string, unknown>,
  }));

  return {
    id: String(raw.id),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    totalAmount: raw.total,
    status: toPurchaseOrderStatus(raw.status),
    contactId: raw.supplier_id !== undefined ? String(raw.supplier_id) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type BuchhaltungsButzePurchaseOrder = BuchhaltungsbutzePurchaseOrder
