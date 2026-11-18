import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder';
import type { Lineitem } from '../../../schema/shared';

export interface InvoiceportalPurchaseOrderItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  total_amount?: number;
  [key: string]: unknown;
}

export interface InvoiceportalPurchaseOrder {
  id: string | number;
  date?: string;
  due_date?: string;
  total_amount?: number;
  status?: string;
  supplier_id?: string | number;
  items?: InvoiceportalPurchaseOrderItem[];
  [key: string]: unknown;
}

function toPurchaseOrderStatus(status: string | undefined): PurchaseOrderStatus {
  switch (status) {
    case 'draft': return 'DRAFT';
    case 'sent': return 'ACTIVE';
    case 'paid': return 'COMPLETED';
    case 'cancelled': return 'CANCELLED';
    default: return 'DRAFT';
  }
}

export function transformPurchaseOrder(raw: InvoiceportalPurchaseOrder): PurchaseOrder {
  const lineItems: Lineitem[] = (raw.items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unit_price,
    totalAmount: item.total_amount,
    metadata: item as Record<string, unknown>,
  }));

  return {
    id: String(raw.id),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    totalAmount: raw.total_amount,
    status: toPurchaseOrderStatus(raw.status),
    contactId: raw.supplier_id !== undefined ? String(raw.supplier_id) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type InvoicePortalPurchaseOrder = InvoiceportalPurchaseOrder
