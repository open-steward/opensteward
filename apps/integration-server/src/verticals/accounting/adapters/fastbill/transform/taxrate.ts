import type { TaxRate } from '../../../schema/taxrate';

export interface FastbillTaxRate {
  TAX_ID: string | number;
  TAX_NAME?: string;
  TAX_RATE?: number;
  IS_ACTIVE?: boolean;
  [key: string]: unknown;
}

export function transformTaxRate(raw: FastbillTaxRate): TaxRate {
  return {
    id: String(raw.TAX_ID),
    name: raw.TAX_NAME,
    rate: raw.TAX_RATE,
    isActive: raw.IS_ACTIVE,
    metadata: raw as Record<string, unknown>,
  };
}

export type FastBillTaxRate = FastbillTaxRate
