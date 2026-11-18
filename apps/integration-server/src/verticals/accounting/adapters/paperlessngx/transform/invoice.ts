import type { Invoice, InvoiceStatus } from '../../../schema/invoice';

export interface PaperlessngxInvoice {
  id: string | number;
  title: string;
  created: string;
  correspondent?: number;
  document_type?: number;
  content?: string;
  tags?: number[];
  archived_file_name?: string;
  [key: string]: unknown;
}

export function transformInvoice(raw: PaperlessngxInvoice): Invoice {
  const status: InvoiceStatus = 'AUTHORIZED';

  return {
    id: String(raw.id),
    type: 'INVOICE' as const,
    invoiceNumber: raw.title,
    postedAt: raw.created ? new Date(raw.created) : undefined,
    totalAmount: 0,
    status,
    contactId: raw.correspondent !== undefined && raw.correspondent !== null ? String(raw.correspondent) : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type PaperlessDocument = PaperlessngxInvoice
