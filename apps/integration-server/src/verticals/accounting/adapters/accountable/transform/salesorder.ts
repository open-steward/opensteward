import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder';
import type { Lineitem } from '../../../schema/shared';

export interface AccountableSalesOrderItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  [key: string]: unknown;
}

export interface AccountableSalesOrder {
  id: string | number;
  date?: string;
  totalAmount?: number;
  status?: string;
  clientId?: string | number;
  items?: AccountableSalesOrderItem[];
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

export function transformSalesOrder(raw: AccountableSalesOrder): SalesOrder {
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
    status: toSalesOrderStatus(raw.status),
    contactId: raw.clientId !== undefined ? String(raw.clientId) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}
