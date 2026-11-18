import type { Bill, BillStatus } from '../../../schema/bill';

export interface PaperlessngxBill {
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

export function transformBill(raw: PaperlessngxBill): Bill {
  const status: BillStatus = 'AUTHORIZED';

  return {
    id: String(raw.id),
    billNumber: raw.title,
    postedAt: raw.created ? new Date(raw.created) : undefined,
    totalAmount: 0,
    status,
    metadata: raw as Record<string, unknown>,
  };
}
