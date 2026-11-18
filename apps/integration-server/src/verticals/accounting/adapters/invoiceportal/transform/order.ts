import type { Order, OrderStatus } from '../../../schema/order';
import type { Lineitem } from '../../../schema/shared';

export interface InvoiceportalOrderItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  total_amount?: number;
  [key: string]: unknown;
}

export interface InvoiceportalOrder {
  id: string | number;
  date?: string;
  total_amount?: number;
  status?: string;
  recipient_id?: string | number;
  items?: InvoiceportalOrderItem[];
  [key: string]: unknown;
}

function toOrderStatus(status: string | undefined): OrderStatus {
  switch (status) {
    case 'draft': return 'DRAFT';
    case 'sent': return 'ACTIVE';
    case 'paid': return 'COMPLETED';
    case 'cancelled': return 'CANCELLED';
    default: return 'DRAFT';
  }
}

export function transformOrder(raw: InvoiceportalOrder): Order {
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
    status: toOrderStatus(raw.status),
    contactId: raw.recipient_id !== undefined ? String(raw.recipient_id) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type InvoicePortalOrder = InvoiceportalOrder
