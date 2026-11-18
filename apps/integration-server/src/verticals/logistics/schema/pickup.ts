/**
 * Pickup — a carrier collection scheduled at an address for a time window.
 *
 * Class B RPC resource, like `rate`: scheduled, read and cancelled over
 * `/pickups`, never synced. There is deliberately no `sync/listable-resources.ts`
 * entry and no cache — UPS and FedEx cannot enumerate pending pickups at all,
 * and a cancel that flips carrier-side state must not be answered from a
 * stale row.
 *
 * Not yet declared in any `adapters/<slug>/metadata.ts` — the metadata PR
 * owns that, and `totalResources` stays at 8 until it lands.
 */
import { z } from 'zod'
import { ExternalId, withUnknown } from '@opensteward/shared'
import { AddressSchema } from './shared'

export const PickupStatusSchema = withUnknown(['PENDING', 'SCHEDULED', 'CANCELLED', 'FAILED'])
export type PickupStatus = z.infer<typeof PickupStatusSchema>

export const PickupSchema = z.object({
  id: ExternalId.meta({ example: 'pkup_1042' }),
  confirmationNumber: z
    .string()
    .optional()
    .describe(
      'Carrier-issued confirmation — UPS PRN, FedEx pickupConfirmationCode, USPS confirmationNumber, DHL dispatchConfirmationNumber. Often the same string as `id`.',
    )
    .meta({ example: '2929602E9CP' }),
  carrierId: z.string().optional().meta({ example: 'ups' }),
  status: PickupStatusSchema.meta({ example: 'SCHEDULED' }),
  address: AddressSchema.optional().describe('Where the carrier collects.'),
  readyAt: z
    .date()
    .optional()
    .describe('Earliest time the packages are ready for collection.')
    .meta({ example: '2026-01-15T09:30:00Z' }),
  closeAt: z
    .date()
    .optional()
    .describe('Latest time the carrier may still collect — the close of the pickup window.')
    .meta({ example: '2026-01-15T17:00:00Z' }),
  shipmentIds: z
    .array(z.string())
    .optional()
    .describe(
      'Shipments the pickup covers. Label / transaction ids ride here on platforms that schedule by label rather than by shipment — the same reading `shippo/transform/manifest.ts` makes of `transactions[]`.',
    )
    .meta({ example: ['shp_8f3a2b9c4d'] }),
  instructions: z
    .string()
    .optional()
    .describe('Free-text note for the driver.')
    .meta({ example: 'Ring the bell at the loading dock.' }),
  createdAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type Pickup = z.infer<typeof PickupSchema>
