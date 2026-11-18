import type { TaxRate } from '../../../schema/taxrate';

export interface PaperlessngxTaxRate {
  id: string | number;
  name: string;
  [key: string]: unknown;
}

export function transformTaxRate(raw: PaperlessngxTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name,
    rate: 0,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  };
}
