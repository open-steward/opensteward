import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, cachedDelete, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Activity } from '../schema/activity'

const RESOURCE = 'activities'

export function createActivitiesRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/activities', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listActivities) {
        return reply.status(501).send({ error: 'listActivities not implemented by this adapter' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Activity>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listActivities!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/activities/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getActivity) {
        return reply.status(501).send({ error: 'getActivity not implemented by this adapter' })
      }
      const data = await cachedGet<Activity>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getActivity!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/activities', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createActivity) {
        return reply.status(501).send({ error: 'createActivity not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.createActivity(credentials, parsed.data as Partial<Activity>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.patch<{ Params: { id: string } }>('/activities/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.updateActivity) {
        return reply.status(501).send({ error: 'updateActivity not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.updateActivity(
        credentials,
        request.params.id,
        parsed.data as Partial<Activity>,
      )
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.delete<{ Params: { id: string } }>('/activities/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.deleteActivity) {
        return reply.status(501).send({ error: 'deleteActivity not implemented by this adapter' })
      }
      await adapter.deleteActivity(credentials, request.params.id)
      cachedDelete(request, { resourceType: RESOURCE, resourceId: request.params.id })
      return reply.status(204).send()
    })
  }
}
