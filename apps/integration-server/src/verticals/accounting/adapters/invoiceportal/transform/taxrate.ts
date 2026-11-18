import type { TaxRate } from '../../../schema/taxrate';

export interface InvoiceportalTaxRate {
  id: string | number;
  name?: string;
  rate?: number;
  is_active?: boolean;
  [key: string]: unknown;
}

export function transformTaxRate(raw: InvoiceportalTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name,
    rate: raw.rate,
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  };
}

export type InvoicePortalTaxRate = InvoiceportalTaxRate
