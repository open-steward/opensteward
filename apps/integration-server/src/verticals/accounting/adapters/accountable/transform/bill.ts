import type { Bill, BillStatus } from '../../../schema/bill';
import type { Lineitem } from '../../../schema/shared';

export interface AccountableBillItem {
  id?: string | number;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  vatAmount?: number;
  [key: string]: unknown;
}

export interface AccountableBill {
  id: string | number;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  netAmount?: number;
  vatAmount?: number;
  totalAmount?: number;
  remainingAmount?: number;
  status?: string;
  currency?: string;
  supplierId?: string | number;
  items?: AccountableBillItem[];
  [key: string]: unknown;
}

function toBillStatus(status: string | undefined): BillStatus {
  switch (status) {
    case 'DRAFT': return 'DRAFT';
    case 'SENT': return 'AUTHORIZED';
    case 'PAID': return 'PAID';
    case 'CANCELLED': return 'VOIDED';
    default: return 'DRAFT';
  }
}

export function transformBill(raw: AccountableBill): Bill {
  const lineItems: Lineitem[] = (raw.items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unitPrice,
    taxAmount: item.vatAmount,
    totalAmount: item.totalPrice,
    metadata: item as Record<string, unknown>,
  }));

  return {
    id: String(raw.id),
    billNumber: raw.invoiceNumber,
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.remainingAmount,
    status: toBillStatus(raw.status),
    currency: raw.currency,
    contactId: raw.supplierId !== undefined ? String(raw.supplierId) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}
