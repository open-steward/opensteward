import type { Warehouse } from '../../../schema/warehouse'
import { toAddress } from '../../shared/transform'

// ─── Delhivery raw types ───────────────────────────────────────────────────
// Source: POST https://track.delhivery.com/api/backend/clientwarehouse/create/
// The response echoes back the submitted fields on success.

export interface DelhiveryWarehouse {
  name: string | null
  registered_name: string | null
  address: string | null
  city: string | null
  state: string | null
  pin: string | null
  phone: string | null
  email: string | null
  return_address: string | null
  return_city: string | null
  return_state: string | null
  return_pin: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformWarehouse(raw: DelhiveryWarehouse): Warehouse {
  const addrRaw: Record<string, unknown> = {
    name: raw.registered_name ?? raw.name,
    address_line1: raw.address,
    city: raw.city,
    state: raw.state,
    postal_code: raw.pin,
    phone: raw.phone,
    email: raw.email,
  }

  return {
    id: raw.name ?? undefined,
    name: raw.name ?? undefined,
    code: raw.name ?? undefined,
    address: toAddress(addrRaw),
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
