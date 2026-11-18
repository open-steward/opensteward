import type { Bill, BillStatus } from '../../../schema/bill'

export interface MyunisoftBill {
  id: string
  invoice_number: string
  fournisseur_id: string
  ht: number
  tva: number
  ttc: number
  solde: number
  devise: string
  date: string
  deadline: string
  status: number
  [key: string]: unknown
}

function mapStatus(status: number): BillStatus {
  switch (status) {
    case 1: return 'AUTHORIZED'
    case 2: return 'PAID'
    case 3: return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: MyunisoftBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.invoice_number || undefined,
    contactId: raw.fournisseur_id || undefined,
    currency: raw.devise || undefined,
    totalAmount: raw.ttc,
    taxAmount: raw.tva,
    balanceAmount: raw.solde,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.deadline ? new Date(raw.deadline) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
