import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder';

export interface PaperlessngxSalesOrder {
  id: string | number;
  title: string;
  created: string;
  [key: string]: unknown;
}

export function transformSalesOrder(raw: PaperlessngxSalesOrder): SalesOrder {
  const status: SalesOrderStatus = 'DRAFT';

  return {
    id: String(raw.id),
    postedAt: raw.created ? new Date(raw.created) : undefined,
    totalAmount: 0,
    status,
    metadata: raw as Record<string, unknown>,
  };
}
