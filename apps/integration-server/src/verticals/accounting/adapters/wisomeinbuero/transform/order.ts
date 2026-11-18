/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Order, OrderStatus } from '../../../schema/order';
import type { Lineitem } from '../../../schema/shared';

export interface WisomeinbueroOrderItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  [key: string]: unknown;
}

export interface WisomeinbueroOrder {
  id: string | number;
  date?: string;
  totalAmount?: number;
  status?: string;
  customerId?: string | number;
  items?: WisomeinbueroOrderItem[];
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

export function transformOrder(raw: WisomeinbueroOrder): Order {
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
    status: toOrderStatus(raw.status),
    contactId: raw.customerId !== undefined ? String(raw.customerId) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type WisoOrder = WisomeinbueroOrder
