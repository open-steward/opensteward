import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder';
import type { Lineitem } from '../../../schema/shared';

export interface FastbillSalesOrderItem {
  DESCRIPTION?: string;
  QUANTITY?: number;
  UNIT_PRICE?: number;
  COMPLETE_GROSS?: number;
  [key: string]: unknown;
}

export interface FastbillSalesOrder {
  ORDER_ID: string | number;
  ORDER_DATE?: string;
  TOTAL?: number;
  STATUS?: string;
  CUSTOMER_ID?: string | number;
  ITEMS?: FastbillSalesOrderItem[];
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

export function transformSalesOrder(raw: FastbillSalesOrder): SalesOrder {
  const lineItems: Lineitem[] = (raw.ITEMS ?? []).map((item) => ({
    description: item.DESCRIPTION,
    quantity: item.QUANTITY,
    unitAmount: item.UNIT_PRICE,
    totalAmount: item.COMPLETE_GROSS,
    metadata: item as Record<string, unknown>,
  }));

  return {
    id: String(raw.ORDER_ID),
    postedAt: raw.ORDER_DATE ? new Date(raw.ORDER_DATE) : undefined,
    totalAmount: raw.TOTAL,
    status: toSalesOrderStatus(raw.STATUS),
    contactId: raw.CUSTOMER_ID !== undefined ? String(raw.CUSTOMER_ID) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type FastBillSalesOrder = FastbillSalesOrder
