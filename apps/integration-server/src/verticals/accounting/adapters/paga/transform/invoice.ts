import type { Invoice } from '../../../schema/invoice'

// Paga is a payment platform and does not expose invoicing endpoints.
export interface PagaStubInvoice {
  [key: string]: unknown
}

export function transformInvoice(raw: PagaStubInvoice): Invoice {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
