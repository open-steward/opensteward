import type { Order, OrderStatus } from '../../../schema/order';
import type { Lineitem } from '../../../schema/shared';

export interface AccountableOrderItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  [key: string]: unknown;
}

export interface AccountableOrder {
  id: string | number;
  date?: string;
  totalAmount?: number;
  status?: string;
  clientId?: string | number;
  items?: AccountableOrderItem[];
  [key: string]: unknown;
}

function toOrderStatus(status: string | undefined): OrderStatus {
  switch (status) {
    case 'DRAFT': return 'DRAFT';
    case 'SENT': return 'ACTIVE';
    case 'PAID': return 'COMPLETED';
    case 'CANCELLED': return 'CANCELLED';
    default: return 'DRAFT';
  }
}

export function transformOrder(raw: AccountableOrder): Order {
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
    status: toOrderStatus(raw.status),
    contactId: raw.clientId !== undefined ? String(raw.clientId) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}
