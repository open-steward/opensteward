import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder';
import type { Lineitem } from '../../../schema/shared';

export interface BuchhaltungsbutzeSalesOrderItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  gross?: number;
  [key: string]: unknown;
}

export interface BuchhaltungsbutzeSalesOrder {
  id: string | number;
  date?: string;
  total?: number;
  status?: string;
  customer_id?: string | number;
  items?: BuchhaltungsbutzeSalesOrderItem[];
  [key: string]: unknown;
}

function toSalesOrderStatus(status: string | undefined): SalesOrderStatus {
  switch (status) {
    case 'draft': return 'DRAFT';
    case 'open': return 'ACTIVE';
    case 'paid': return 'COMPLETED';
    case 'cancelled': return 'CANCELLED';
    default: return 'DRAFT';
  }
}

export function transformSalesOrder(raw: BuchhaltungsbutzeSalesOrder): SalesOrder {
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
    status: toSalesOrderStatus(raw.status),
    contactId: raw.customer_id !== undefined ? String(raw.customer_id) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type BuchhaltungsButzeSalesOrder = BuchhaltungsbutzeSalesOrder
