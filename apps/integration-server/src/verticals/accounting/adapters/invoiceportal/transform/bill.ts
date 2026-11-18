import type { Bill, BillStatus } from '../../../schema/bill';
import type { Lineitem } from '../../../schema/shared';

export interface InvoiceportalBillItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  tax_amount?: number;
  total_amount?: number;
  [key: string]: unknown;
}

export interface InvoiceportalBill {
  id: string | number;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  amount_net?: number;
  amount_tax?: number;
  amount_gross?: number;
  amount_open?: number;
  status?: string;
  currency_code?: string;
  supplier_id?: string | number;
  items?: InvoiceportalBillItem[];
  [key: string]: unknown;
}

function toBillStatus(status: string | undefined): BillStatus {
  switch (status) {
    case 'draft': return 'DRAFT';
    case 'sent': return 'AUTHORIZED';
    case 'paid': return 'PAID';
    case 'cancelled': return 'VOIDED';
    default: return 'DRAFT';
  }
}

export function transformBill(raw: InvoiceportalBill): Bill {
  const lineItems: Lineitem[] = (raw.items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unit_price,
    taxAmount: item.tax_amount,
    totalAmount: item.total_amount,
    metadata: item as Record<string, unknown>,
  }));

  return {
    id: String(raw.id),
    billNumber: raw.invoice_number,
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    totalAmount: raw.amount_gross,
    taxAmount: raw.amount_tax,
    balanceAmount: raw.amount_open,
    status: toBillStatus(raw.status),
    currency: raw.currency_code,
    contactId: raw.supplier_id !== undefined ? String(raw.supplier_id) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type InvoicePortalBill = InvoiceportalBill
