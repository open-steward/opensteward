import type { TaxRate } from '../../../schema/taxrate';

export interface BuchhaltungsbutzeTaxRate {
  id: string | number;
  name?: string;
  rate?: number;
  active?: boolean;
  [key: string]: unknown;
}

export function transformTaxRate(raw: BuchhaltungsbutzeTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name,
    rate: raw.rate,
    isActive: raw.active,
    metadata: raw as Record<string, unknown>,
  };
}

export type BuchhaltungsButzeTaxRate = BuchhaltungsbutzeTaxRate
