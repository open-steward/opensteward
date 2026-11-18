import type { Order, OrderStatus } from '../../../schema/order';
import type { Lineitem } from '../../../schema/shared';

export interface BuchhaltungsbutzeOrderItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  gross?: number;
  [key: string]: unknown;
}

export interface BuchhaltungsbutzeOrder {
  id: string | number;
  date?: string;
  total?: number;
  status?: string;
  customer_id?: string | number;
  items?: BuchhaltungsbutzeOrderItem[];
  [key: string]: unknown;
}

function toOrderStatus(status: string | undefined): OrderStatus {
  switch (status) {
    case 'draft': return 'DRAFT';
    case 'open': return 'ACTIVE';
    case 'paid': return 'COMPLETED';
    case 'cancelled': return 'CANCELLED';
    default: return 'DRAFT';
  }
}

export function transformOrder(raw: BuchhaltungsbutzeOrder): Order {
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
    status: toOrderStatus(raw.status),
    contactId: raw.customer_id !== undefined ? String(raw.customer_id) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type BuchhaltungsButzeOrder = BuchhaltungsbutzeOrder
