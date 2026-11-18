import type { Invoice } from '../../../schema/invoice'

// Kora is a payment infrastructure platform and does not expose an invoices endpoint.
export interface KoraStubInvoice {
  [key: string]: unknown
}

export function transformInvoice(raw: KoraStubInvoice): Invoice {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
