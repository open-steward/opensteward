import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'

export interface FreeAgentPurchaseOrder {
  url: string
  contact: string
  reference: string
  dated_on: string
  currency: string
  total_value: string
  status: 'Draft' | 'Sent' | 'Received'
  [key: string]: unknown
}

function extractId(url: string): string {
  return url.split('/').pop() ?? url
}

function mapStatus(raw: FreeAgentPurchaseOrder): PurchaseOrderStatus {
  switch (raw.status) {
    case 'Draft': return 'DRAFT'
    case 'Sent': return 'ACTIVE'
    case 'Received': return 'COMPLETED'
    default: return 'DRAFT'
  }
}

export function transformPurchaseOrder(raw: FreeAgentPurchaseOrder): PurchaseOrder {
  return {
    id: extractId(raw.url),
    status: mapStatus(raw),
    contactId: raw.contact ? extractId(raw.contact) : undefined,
    currency: raw.currency || undefined,
    totalAmount: parseFloat(raw.total_value) || undefined,
    postedAt: raw.dated_on ? new Date(raw.dated_on) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
