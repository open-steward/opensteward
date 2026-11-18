import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { AuditTrailEntry } from '../schema/audit-trail-entry'

const RESOURCE = 'audit_trail_entries'

export function createAuditTrailEntriesRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get<{ Querystring: Record<string, string> }>(
      '/audit_trail_entries',
      async (request, reply) => {
        const { adapter, credentials } = request
        const envelopeId = request.query.envelope_id
        if (!envelopeId) {
          return reply
            .status(400)
            .send({ error: 'envelope_id query parameter is required', code: 'MISSING_PARAM' })
        }
        if (!adapter.listAuditTrailEntries) {
          return reply.status(501).send({
            error: 'listAuditTrailEntries not implemented by this adapter',
            code: 'NOT_IMPLEMENTED',
          })
        }
        const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
        const data = await cachedList<AuditTrailEntry>(request, {
          resourceType: RESOURCE,
          fetch: () =>
            adapter.listAuditTrailEntries!(
              credentials,
              envelopeId,
              params,
            ),
          isComplete: (rows) => collectionIsComplete(params, rows),
        })
        return reply.send(listPage(data, params, adapter.platform, request.log))
      },
    )

    fastify.get<{ Params: { id: string } }>(
      '/audit_trail_entries/:id',
      async (request, reply) => {
        const { adapter, credentials } = request
        if (!adapter.getAuditTrailEntry) {
          return reply.status(501).send({
            error: 'getAuditTrailEntry not implemented by this adapter',
            code: 'NOT_IMPLEMENTED',
          })
        }
        const data = await cachedGet<AuditTrailEntry>(request, {
          resourceType: RESOURCE,
          resourceId: request.params.id,
          fetch: () => adapter.getAuditTrailEntry!(credentials, request.params.id),
        })
        return reply.send(sharedSingleResponse(data, adapter.platform))
      },
    )
  }
}
