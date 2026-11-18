import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify'

/**
 * `{ data: { verticals } }`: the verticals that answer for this caller, sorted.
 * No license details (handover D5): mcp-server registers tools only for these.
 */
export function createCapabilitiesRouter(opts: {
  path: string
  preHandler: preHandlerAsyncHookHandler
  enabledVerticals: () => readonly string[]
}): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get(opts.path, { preHandler: opts.preHandler }, async () => ({
      data: { verticals: [...opts.enabledVerticals()].sort() },
    }))
  }
}
