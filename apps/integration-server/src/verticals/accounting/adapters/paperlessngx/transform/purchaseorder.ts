import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder';

export interface PaperlessngxPurchaseOrder {
  id: string | number;
  title: string;
  created: string;
  [key: string]: unknown;
}

export function transformPurchaseOrder(raw: PaperlessngxPurchaseOrder): PurchaseOrder {
  const status: PurchaseOrderStatus = 'DRAFT';

  return {
    id: String(raw.id),
    postedAt: raw.created ? new Date(raw.created) : undefined,
    totalAmount: 0,
    status,
    metadata: raw as Record<string, unknown>,
  };
}
