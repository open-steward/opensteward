import type { Order, OrderStatus } from '../../../schema/order'

export interface FreeAgentOrder {
  url: string
  contact: string
  estimate_number: string
  reference: string
  dated_on: string
  currency: string
  total_value: string
  status: 'Draft' | 'Sent' | 'Approved' | 'Rejected'
  [key: string]: unknown
}

function extractId(url: string): string {
  return url.split('/').pop() ?? url
}

function mapStatus(raw: FreeAgentOrder): OrderStatus {
  switch (raw.status) {
    case 'Draft': return 'DRAFT'
    case 'Sent': return 'ACTIVE'
    case 'Approved': return 'COMPLETED'
    case 'Rejected': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformOrder(raw: FreeAgentOrder): Order {
  return {
    id: extractId(raw.url),
    status: mapStatus(raw),
    type: 'SALES',
    contactId: raw.contact ? extractId(raw.contact) : undefined,
    currency: raw.currency || undefined,
    totalAmount: parseFloat(raw.total_value) || undefined,
    postedAt: raw.dated_on ? new Date(raw.dated_on) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
