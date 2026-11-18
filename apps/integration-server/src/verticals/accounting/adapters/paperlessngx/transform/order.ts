import type { Order, OrderStatus } from '../../../schema/order';

export interface PaperlessngxOrder {
  id: string | number;
  title: string;
  created: string;
  [key: string]: unknown;
}

export function transformOrder(raw: PaperlessngxOrder): Order {
  const status: OrderStatus = 'DRAFT';

  return {
    id: String(raw.id),
    postedAt: raw.created ? new Date(raw.created) : undefined,
    totalAmount: 0,
    status,
    metadata: raw as Record<string, unknown>,
  };
}
