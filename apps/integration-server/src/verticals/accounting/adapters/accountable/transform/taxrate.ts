import type { TaxRate } from '../../../schema/taxrate';

export interface AccountableTaxRate {
  id: string | number;
  name?: string;
  rate?: number;
  isActive?: boolean;
  [key: string]: unknown;
}

export function transformTaxRate(raw: AccountableTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name,
    rate: raw.rate,
    isActive: raw.isActive,
    metadata: raw as Record<string, unknown>,
  };
}
