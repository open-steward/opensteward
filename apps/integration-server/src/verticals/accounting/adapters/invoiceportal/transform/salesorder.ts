import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder';
import type { Lineitem } from '../../../schema/shared';

export interface InvoiceportalSalesOrderItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  total_amount?: number;
  [key: string]: unknown;
}

export interface InvoiceportalSalesOrder {
  id: string | number;
  date?: string;
  total_amount?: number;
  status?: string;
  recipient_id?: string | number;
  items?: InvoiceportalSalesOrderItem[];
  [key: string]: unknown;
}

function toSalesOrderStatus(status: string | undefined): SalesOrderStatus {
  switch (status) {
    case 'draft': return 'DRAFT';
    case 'sent': return 'ACTIVE';
    case 'paid': return 'COMPLETED';
    case 'cancelled': return 'CANCELLED';
    default: return 'DRAFT';
  }
}

export function transformSalesOrder(raw: InvoiceportalSalesOrder): SalesOrder {
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
    status: toSalesOrderStatus(raw.status),
    contactId: raw.recipient_id !== undefined ? String(raw.recipient_id) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type InvoicePortalSalesOrder = InvoiceportalSalesOrder
