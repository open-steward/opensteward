import type { Carrier } from '../../../schema/carrier'

// ─── DPD-DE carrier (static / derived) ─────────────────────────────────────
//
// DPD Germany does not expose a "list carriers" or "get carrier" endpoint.
// It is itself a single carrier.  The carrier record is derived from the
// publicly documented service codes for DPD Germany.
//
// Sources:
//   ShipEngine DPD Germany Carrier Guide (shipengine.com/docs/carriers/dpd-de-guide/)
//   DPD Germany developer portal (dpd.com/de/developer)

export interface DpdDeServiceDefinition {
  code: string
  name: string
}

/**
 * Publicly documented DPD Germany (DPD DE) service codes.
 * Based on the ShipEngine DPD Germany carrier guide and DPD's published services.
 */
const DPD_DE_SERVICES: DpdDeServiceDefinition[] = [
  { code: '1^01', name: 'DPD Classic' },
  { code: '1^09', name: 'DPD 8:30' },
  { code: '1^10', name: 'DPD 12:00' },
  { code: '1^18', name: 'DPD 18:00' },
  { code: '1^30', name: 'DPD Max' },
  { code: '1^60', name: 'DPD ParcelLetter' },
  { code: '1^06', name: 'DPD International Classic' },
  { code: '1^02', name: 'DPD Express' },
]

export function transformCarrier(): Carrier {
  return {
    id: 'dpd-de',
    name: 'DPD Germany',
    code: 'dpd-de',
    trackingUrlTemplate: 'https://www.dpd.com/de/en/empfangen/sendungsverfolgung-und-live-tracking/?pknr={trackingNumber}',
    services: DPD_DE_SERVICES.map((s) => ({
      code: s.code,
      name: s.name,
    })),
    isActive: true,
    metadata: { source: 'static' } as Record<string, unknown>,
  }
}
