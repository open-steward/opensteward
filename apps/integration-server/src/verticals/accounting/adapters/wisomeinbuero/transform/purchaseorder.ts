/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder';
import type { Lineitem } from '../../../schema/shared';

export interface WisomeinbueroPurchaseOrderItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  [key: string]: unknown;
}

export interface WisomeinbueroPurchaseOrder {
  id: string | number;
  date?: string;
  dueDate?: string;
  totalAmount?: number;
  status?: string;
  supplierId?: string | number;
  items?: WisomeinbueroPurchaseOrderItem[];
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

export function transformPurchaseOrder(raw: WisomeinbueroPurchaseOrder): PurchaseOrder {
  const lineItems: Lineitem[] = (raw.items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unitPrice,
    totalAmount: item.totalAmount,
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

export type WisoPurchaseOrder = WisomeinbueroPurchaseOrder
