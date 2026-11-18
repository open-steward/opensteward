import type { Invoice } from '../../../schema/invoice'

// Sila is a digital banking infrastructure platform and does not expose invoicing endpoints.
export interface SilaStubInvoice {
  [key: string]: unknown
}

export function transformInvoice(raw: SilaStubInvoice): Invoice {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
