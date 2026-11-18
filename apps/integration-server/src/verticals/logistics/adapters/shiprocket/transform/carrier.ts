import type { Carrier } from '../../../schema/carrier'

// Shiprocket GET courier/courierListWithCounts
// Query: type=active|inactive|all (optional; default all)
// Response envelope:
//   { total_courier_count, courier_count, serviceable_pincodes_count, ...,
//     courier_data: ShiprocketCourier[] }
//
// This is the company-level courier list, not the serviceability response
// `transform/rate.ts` reads. The two do NOT share a row shape: a courier row is
// keyed `id` / `name` where a rate row is keyed `courier_company_id` /
// `courier_name`, and a courier row carries no charge. They do share the id
// space — `id` here is the `courier_company_id` on a shipment, rate and
// tracking row, which is what makes it the join key.
//
// Each row is a courier company AND a service band ("FedEx Surface 5 Kg",
// "FedEx Flat Rate" are separate rows with separate ids), so a row maps to one
// Carrier rather than a Carrier with services.

export interface ShiprocketCourier {
  id: number
  name: string | null
  master_company: string | null          // same as name in every published example
  status: number | null                  // 1 = active, 0 = inactive (same convention as pickup locations)
  courier_type: number | string | null   // 0 in the courier list; the serviceability response sends it as a string
  type: number | null
  mode: number | null                    // 0 = surface, 1 = air
  service_type: number | null
  min_weight: number | null
  base_courier_id: number | null
  is_own_key_courier: number | null
  is_hyperlocal: number | null
  activated_date: string | null          // date the courier was enabled on the account — not a record createdAt; left in metadata
  image: { logo: string | null; small_logo: string | null; [key: string]: unknown } | null
  [key: string]: unknown
}

export interface ShiprocketCourierListResponse {
  total_courier_count: number | null
  courier_count: number | null
  courier_data: ShiprocketCourier[] | null
  [key: string]: unknown
}

export function transformCarrier(raw: ShiprocketCourier): Carrier {
  return {
    id: String(raw.id),
    name: raw.name ?? raw.master_company ?? undefined,
    // Shiprocket has no carrier code string. The courier company id is the
    // only stable handle, and what `courier_company_id` on a shipment refers to.
    code: String(raw.id),
    isActive: raw.status != null ? raw.status === 1 : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
