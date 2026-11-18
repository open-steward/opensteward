/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { TaxRate } from '../../../schema/taxrate';

export interface WisomeinbueroTaxRate {
  id: string | number;
  name?: string;
  rate?: number;
  isActive?: boolean;
  [key: string]: unknown;
}

export function transformTaxRate(raw: WisomeinbueroTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name,
    rate: raw.rate,
    isActive: raw.isActive,
    metadata: raw as Record<string, unknown>,
  };
}

export type WisoTaxRate = WisomeinbueroTaxRate
