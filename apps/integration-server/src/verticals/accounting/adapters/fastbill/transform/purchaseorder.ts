import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder';
import type { Lineitem } from '../../../schema/shared';

export interface FastbillPurchaseOrderItem {
  DESCRIPTION?: string;
  QUANTITY?: number;
  UNIT_PRICE?: number;
  COMPLETE_GROSS?: number;
  [key: string]: unknown;
}

export interface FastbillPurchaseOrder {
  PURCHASE_ID: string | number;
  PURCHASE_DATE?: string;
  DUE_DATE?: string;
  TOTAL?: number;
  STATUS?: string;
  SUPPLIER_ID?: string | number;
  ITEMS?: FastbillPurchaseOrderItem[];
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

export function transformPurchaseOrder(raw: FastbillPurchaseOrder): PurchaseOrder {
  const lineItems: Lineitem[] = (raw.ITEMS ?? []).map((item) => ({
    description: item.DESCRIPTION,
    quantity: item.QUANTITY,
    unitAmount: item.UNIT_PRICE,
    totalAmount: item.COMPLETE_GROSS,
    metadata: item as Record<string, unknown>,
  }));

  return {
    id: String(raw.PURCHASE_ID),
    postedAt: raw.PURCHASE_DATE ? new Date(raw.PURCHASE_DATE) : undefined,
    totalAmount: raw.TOTAL,
    status: toPurchaseOrderStatus(raw.STATUS),
    contactId: raw.SUPPLIER_ID !== undefined ? String(raw.SUPPLIER_ID) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type FastBillPurchaseOrder = FastbillPurchaseOrder
