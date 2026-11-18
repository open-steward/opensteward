/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder';
import type { Lineitem } from '../../../schema/shared';

export interface WisomeinbueroSalesOrderItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  [key: string]: unknown;
}

export interface WisomeinbueroSalesOrder {
  id: string | number;
  date?: string;
  totalAmount?: number;
  status?: string;
  customerId?: string | number;
  items?: WisomeinbueroSalesOrderItem[];
  [key: string]: unknown;
}

function toSalesOrderStatus(status: string | undefined): SalesOrderStatus {
  switch (status) {
    case 'DRAFT': return 'DRAFT';
    case 'SENT': return 'ACTIVE';
    case 'PAID': return 'COMPLETED';
    case 'CANCELLED': return 'CANCELLED';
    default: return 'DRAFT';
  }
}

export function transformSalesOrder(raw: WisomeinbueroSalesOrder): SalesOrder {
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
    status: toSalesOrderStatus(raw.status),
    contactId: raw.customerId !== undefined ? String(raw.customerId) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type WisoSalesOrder = WisomeinbueroSalesOrder
