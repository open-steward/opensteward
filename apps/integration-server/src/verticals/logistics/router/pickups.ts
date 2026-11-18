import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import {
  parseListQuery,
  listPage,
  sharedSingleResponse,
  assertSearchSupported,
} from '@opensteward/shared'
import type { PickupCancelParams, PickupRequestParams } from '../adapter/interface'

/**
 * Pickups are RPC-shaped, like rates: nothing here touches the read-through
 * cache. There is no `sync/listable-resources.ts` entry that could mark a
 * cached collection complete, and a cancel that flips carrier-side state must
 * not be answered from a stale row. Every route goes upstream, every time.
 */

// JSON has no Date. Both window timestamps are `z.date()` on the canonical
// record, so revive them at the door and hand adapters a Date they can format
// for their carrier — an unparseable timestamp is a 400 here rather than an
// `Invalid time value` from inside a carrier client. Everything else passes
// through untouched: the adapter owns validation of what its carrier needs.
const PickupRequestBodySchema = z.looseObject({
  readyAt: z.coerce.date().optional(),
  closeAt: z.coerce.date().optional(),
})

export function createPickupsRouter() {
  return async function pickupsRouter(fastify: FastifyInstance): Promise<void> {
    fastify.get('/pickups', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listPickups)
        return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await adapter.listPickups(credentials, params)
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/pickups/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getPickup) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const data = await adapter.getPickup(credentials, request.params.id)
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/pickups', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createPickup)
        return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const parsed = PickupRequestBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.createPickup(credentials, parsed.data as PickupRequestParams)
      return reply.status(201).send(sharedSingleResponse(data, adapter.platform))
    })

    // A POST action rather than a DELETE, and it answers with the record:
    // FedEx and DHL cannot cancel by id alone — their cancels carry a body a
    // DELETE has nowhere to put — and the caller wants the carrier's final
    // state back, not a 204.
    fastify.post<{ Params: { id: string } }>('/pickups/:id/cancel', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.cancelPickup)
        return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body ?? {})
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.cancelPickup(
        credentials,
        request.params.id,
        parsed.data as PickupCancelParams,
      )
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
