import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'

export interface FreeAgentSalesOrder {
  url: string
  contact: string
  reference: string
  dated_on: string
  currency: string
  total_value: string
  status: 'Draft' | 'Sent' | 'Fulfilled'
  [key: string]: unknown
}

function extractId(url: string): string {
  return url.split('/').pop() ?? url
}

function mapStatus(raw: FreeAgentSalesOrder): SalesOrderStatus {
  switch (raw.status) {
    case 'Draft': return 'DRAFT'
    case 'Sent': return 'ACTIVE'
    case 'Fulfilled': return 'COMPLETED'
    default: return 'DRAFT'
  }
}

export function transformSalesOrder(raw: FreeAgentSalesOrder): SalesOrder {
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
