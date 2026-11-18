import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder';
import type { Lineitem } from '../../../schema/shared';

export interface AccountablePurchaseOrderItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  [key: string]: unknown;
}

export interface AccountablePurchaseOrder {
  id: string | number;
  date?: string;
  dueDate?: string;
  totalAmount?: number;
  status?: string;
  supplierId?: string | number;
  items?: AccountablePurchaseOrderItem[];
  [key: string]: unknown;
}

function toPurchaseOrderStatus(status: string | undefined): PurchaseOrderStatus {
  switch (status) {
    case 'DRAFT': return 'DRAFT';
    case 'SENT': return 'ACTIVE';
    case 'PAID': return 'COMPLETED';
    case 'CANCELLED': return 'CANCELLED';
    default: return 'DRAFT';
  }
}

export function transformPurchaseOrder(raw: AccountablePurchaseOrder): PurchaseOrder {
  const lineItems: Lineitem[] = (raw.items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unitPrice,
    totalAmount: item.totalPrice,
    metadata: item as Record<string, unknown>,
  }));

  return {
    id: String(raw.id),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    totalAmount: raw.totalAmount,
    status: toPurchaseOrderStatus(raw.status),
    contactId: raw.supplierId !== undefined ? String(raw.supplierId) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}
