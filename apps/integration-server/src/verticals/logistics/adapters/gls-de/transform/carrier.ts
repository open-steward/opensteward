import type { Carrier } from '../../../schema/carrier'

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * GLS Germany (GLS-DE) is itself the single carrier.
 * There is no carrier-list endpoint in the GLS ShipIT API; the carrier
 * record is synthesised from the known constants of this adapter.
 */
export function transformCarrier(): Carrier {
  return {
    id: 'gls-de',
    name: 'GLS Germany',
    code: 'GLS',
    trackingUrlTemplate: 'https://gls-group.eu/DE/de/paketverfolgung?match={trackingNumber}',
    services: [
      { code: 'PARCEL',  name: 'GLS Parcel' },
      { code: 'EXPRESS', name: 'GLS Express' },
      { code: 'FREIGHT', name: 'GLS Freight' },
    ],
    isActive: true,
    metadata: { platform: 'gls-de' },
  }
}
