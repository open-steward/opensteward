import { z } from 'zod'
import { ExternalId, withUnknown } from '@opensteward/shared'

export const ManifestStatusSchema = withUnknown(['OPEN', 'CLOSED', 'SUBMITTED', 'ACCEPTED'])
export type ManifestStatus = z.infer<typeof ManifestStatusSchema>

export const ManifestSchema = z.object({
  id: ExternalId.optional().meta({ example: 'mfst_1042' }),
  carrierId: z.string().optional().meta({ example: 'ups' }),
  warehouseId: z.string().optional().meta({ example: 'wh_sfo1' }),
  manifestNumber: z.string().optional().meta({ example: 'MAN-1042' }),
  status: ManifestStatusSchema.optional().meta({ example: 'SUBMITTED' }),
  shipmentIds: z.array(z.string()).optional().meta({ example: ['shp_8f3a2b9c4d'] }),
  labelCount: z.number().int().min(0).optional().describe('Number of labels included in the manifest.').meta({ example: 1 }),
  submittedAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  createdAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type Manifest = z.infer<typeof ManifestSchema>
