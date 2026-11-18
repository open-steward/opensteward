import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, cachedDelete, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Note } from '../schema/note'

const RESOURCE = 'notes'

export function createNotesRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/notes', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listNotes) {
        return reply.status(501).send({ error: 'listNotes not implemented by this adapter' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Note>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listNotes!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/notes/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getNote) {
        return reply.status(501).send({ error: 'getNote not implemented by this adapter' })
      }
      const data = await cachedGet<Note>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getNote!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/notes', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createNote) {
        return reply.status(501).send({ error: 'createNote not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.createNote(credentials, parsed.data as Partial<Note>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.patch<{ Params: { id: string } }>('/notes/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.updateNote) {
        return reply.status(501).send({ error: 'updateNote not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.updateNote(
        credentials,
        request.params.id,
        parsed.data as Partial<Note>,
      )
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.delete<{ Params: { id: string } }>('/notes/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.deleteNote) {
        return reply.status(501).send({ error: 'deleteNote not implemented by this adapter' })
      }
      await adapter.deleteNote(credentials, request.params.id)
      cachedDelete(request, { resourceType: RESOURCE, resourceId: request.params.id })
      return reply.status(204).send()
    })
  }
}
