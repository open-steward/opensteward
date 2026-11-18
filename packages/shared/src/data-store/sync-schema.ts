import { z } from 'zod'

/** Per-resource-type progress within a sync job. */
export const ResourceProgressSchema = z.object({
  synced: z.number(),
  status: z.enum(['pending', 'running', 'completed', 'skipped', 'failed']),
  error: z.string().optional(),
})
export type ResourceProgress = z.infer<typeof ResourceProgressSchema>

/**
 * Why a sync job was queued:
 *   manual    the admin console's Sync now
 *   api       POST /v1/{vertical}/sync
 *   connect   the Connect Link OAuth callback, right after connecting
 *   boot      DATA_STORE_AUTO_SYNC_ON_BOOT
 *   schedule  the connection's sync schedule (SyncScheduler)
 */
export const SyncJobOriginSchema = z.enum(['manual', 'api', 'connect', 'boot', 'schedule'])
export type SyncJobOrigin = z.infer<typeof SyncJobOriginSchema>

export const SyncJobSchema = z.object({
  id: z.string(),
  vertical: z.string(),
  connectionId: z.string(),
  platform: z.string(),
  tenantId: z.string().nullable(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  progress: z.record(z.string(), ResourceProgressSchema).nullable(),
  error: z.string().nullable(),
  callbackUrl: z.string().url().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  /** Why the job was queued. Null on jobs queued before this field existed;
   *  optional so a job object built elsewhere need not carry it. */
  origin: SyncJobOriginSchema.nullable().optional(),
})
export type SyncJob = z.infer<typeof SyncJobSchema>

export const CreateSyncJobBodySchema = z
  .object({
    connection_id: z.string().optional(),
    platform: z.string().optional(),
    tenant: z.string().optional(),
    callback_url: z.string().url().optional(),
  })
  .refine((v) => v.connection_id || v.platform, {
    message: 'connection_id or platform is required',
  })
export type CreateSyncJobBody = z.infer<typeof CreateSyncJobBodySchema>

/** One row of the per-vertical listable-resources table.
 *
 *  `resourceType` is the canonical slug stored in `resources.resource_type`
 *  (e.g. `invoices`, `contacts`, `shipments`). `method` is the adapter
 *  method that returns canonical rows (e.g. `listInvoices`). Both are
 *  vertical-specific — supplied by `apps/integration-server/src/verticals/<v>/sync/listable-resources.ts`. */
export interface ListableResource {
  resourceType: string
  method: string
}
