/**
 * Console-user profile pictures.
 *
 *   GET    /api/users/:id/avatar  — the picture bytes (any signed-in user)
 *   PUT    /api/users/:id/avatar  — upload a picture (self, or users:manage)
 *   DELETE /api/users/:id/avatar  — remove it          (self, or users:manage)
 *
 * Not behind `adminOnly` like the rest of `/api/users`: every console user may
 * change their OWN picture, and every console user sees everyone's (the
 * header, the users list). Changing someone else's needs `users:manage`, the
 * permission that already governs assigning roles and scope, plus the same
 * escalation guards `PUT /api/users/:id/role` applies — the account must not
 * hold more than the caller, nor see tenants the caller cannot.
 *
 * Uploads are JSON (`{ data: <base64 or data: URL> }`), the pattern
 * company-info uses for its logo, so the route stays in the OpenAPI spec and
 * the generated SDK/CLI. The type is decided by magic bytes alone
 * (`core/users/avatar-image.ts`); the data URL's declared type is ignored and
 * SVG is refused. An upload is `source: upload`, which SSO never replaces.
 *
 * GET is hidden from the spec for the reason logos.ts gives: a binary
 * response cannot carry a Zod schema, and it would only grow a useless
 * command in the generated CLI. It is documented in
 * docs/architecture/auth-and-tenancy.md instead.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AdminStore, UserRow } from '../db/admin-store'
import { UserAvatarStore, avatarApiUrl, avatarVersion } from '../db/user-avatar-store'
import { callerContext, callerMayGrantScope, roleGrantRefusal } from '../auth/access'
import { checkAvatarBytes, decodeAvatarData, AVATAR_MAX_BYTES } from '../users/avatar-image'
import { dataEnvelope, errorBody, noContent } from './_openapi'

const TAG = 'users'

const IdParam = z.object({ id: z.string() })

const PutAvatarBody = z
  .object({
    data: z.string().min(1).meta({
      description:
        'The picture as base64, or as a `data:` URL. PNG, JPEG or WebP, at most 512 KB decoded. The type is read from the bytes; whatever a data URL declares is ignored, and SVG is refused.',
      example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    }),
  })
  .meta({ id: 'PutUserAvatarBody', description: 'A profile picture to store for a console user.' })

const AvatarView = z
  .object({
    avatarUrl: z.string().meta({
      description: 'Where the picture is served, versioned with `?v=` so a change busts caches.',
      example: '/api/users/usr_olivia/avatar?v=9f86d081884c7d65',
    }),
    avatarVersion: z.string().meta({ description: 'Short content hash of the picture.', example: '9f86d081884c7d65' }),
    contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']).meta({
      description: 'Image type identified from the bytes.',
      example: 'image/png',
    }),
    byteSize: z.number().meta({ description: 'Size in bytes.', example: 48213 }),
    source: z.enum(['upload', 'idp']).meta({
      description: '`upload` for a picture set through this API; `idp` for one fetched from the identity provider.',
      example: 'upload',
    }),
  })
  .meta({ id: 'UserAvatar', description: "A console user's stored profile picture." })

/** Refusal messages for a rejected upload, and the status each maps to. */
const REJECTIONS = {
  malformed: [400, 'data must be base64 or a base64 data: URL'],
  empty: [400, 'The picture is empty'],
  too_large: [413, `The picture is larger than ${AVATAR_MAX_BYTES / 1024} KB`],
  unsupported_type: [415, 'Only PNG, JPEG and WebP pictures are accepted'],
} as const

function ifNoneMatchHits(header: string | string[] | undefined, etag: string): boolean {
  if (!header) return false
  const raw = Array.isArray(header) ? header.join(',') : header
  return raw.split(',').some((t) => {
    const tag = t.trim()
    return tag === etag || tag === `W/${etag}` || tag === '*'
  })
}

export function createUserAvatarRoutes(adminStore: AdminStore) {
  const avatars = UserAvatarStore.for(adminStore)

  /**
   * May the caller change this account's picture? Always for their own. For
   * anyone else: `users:manage`, and the account neither holds more than the
   * caller nor sees tenants outside the caller's scope. Returns the refusal,
   * or null when allowed.
   */
  async function refusalFor(request: FastifyRequest, target: UserRow): Promise<string | null> {
    if (target.id === request.jwtUser!.id) return null
    const caller = await callerContext(request)
    if (!caller.permissions.has('users:manage')) {
      return "Forbidden — changing another user's picture needs users:manage"
    }
    const current = await adminStore.getRole(target.role_id ?? target.role)
    const refusal = current ? roleGrantRefusal(caller, current) : null
    if (refusal) return refusal
    const scope = await adminStore.getUserScope(target.id)
    if (scope && !callerMayGrantScope(caller, scope)) {
      return 'This user sees tenants outside your own scope'
    }
    return null
  }

  return async function userAvatarRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)

    fastify.get<{ Params: { id: string } }>(
      '/api/users/:id/avatar',
      { schema: { hide: true } },
      async (request, reply): Promise<FastifyReply> => {
        const head = await avatars.head(request.params.id)
        if (!head) return reply.code(404).send({ error: 'No picture for this user.' })
        const etag = `"${head.sha256}"`
        // `private`: the response needs a signed-in caller, so no shared cache
        // may keep it. Five minutes plus an ETag; the `?v=` on every URL we
        // hand out changes with the picture, so staleness never shows.
        reply
          .header('etag', etag)
          .header('cache-control', 'private, max-age=300')
          .header('x-content-type-options', 'nosniff')
          // Opened directly, the bytes are an image and nothing else: no
          // script, no subresource, no framing — even if a browser were
          // talked into rendering them as a document.
          .header('content-security-policy', "default-src 'none'")
        if (ifNoneMatchHits(request.headers['if-none-match'], etag)) {
          return reply.code(304).send()
        }
        const row = await avatars.get(request.params.id)
        if (!row) return reply.code(404).send({ error: 'No picture for this user.' }) // raced a delete
        return reply
          .header('content-type', row.contentType)
          .header('content-length', String(row.byteSize))
          .send(row.bytes)
      },
    )

    fastify.put<{ Params: { id: string }; Body: z.infer<typeof PutAvatarBody> }>(
      '/api/users/:id/avatar',
      {
        // base64 of 512 KB is ~683 KB; leave room for a data: prefix and JSON.
        bodyLimit: 1024 * 1024,
        schema: {
          tags: [TAG],
          summary: "Upload a console user's profile picture",
          description:
            'Store a profile picture (PNG, JPEG or WebP, at most 512 KB) for a console account, replacing any existing one — including one fetched from the identity provider, which SSO then no longer replaces. Any signed-in user may set their own; setting another user’s needs `users:manage`, and is refused (`403`) when that account holds more than you or sees tenants outside your scope. The type is identified from the bytes: `415` for anything else (SVG included, whatever the data URL declares), `413` when too large, `400` when `data` is not base64. `404` for an unknown user. Writes a `user.avatar_update` audit entry.',
          operationId: 'users.avatar.put',
          params: IdParam,
          body: PutAvatarBody,
          response: {
            200: dataEnvelope(AvatarView),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            413: errorBody,
            415: errorBody,
          },
        },
      },
      async (request, reply) => {
        const target = await adminStore.getUserById(request.params.id)
        if (!target) return reply.status(404).send({ error: 'User not found.' })
        const refusal = await refusalFor(request, target)
        if (refusal) return reply.status(403).send({ error: refusal })

        const decoded = decodeAvatarData(request.body.data)
        if (!decoded.ok) {
          const [status, error] = REJECTIONS[decoded.reason]
          return reply.status(status).send({ error })
        }
        const check = checkAvatarBytes(decoded.bytes)
        if (!check.ok) {
          const [status, error] = REJECTIONS[check.reason]
          return reply.status(status).send({ error })
        }

        const stored = await avatars.put({
          userId: target.id,
          contentType: check.contentType,
          bytes: decoded.bytes,
          source: 'upload',
          updatedBy: request.jwtUser!.id,
        })
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'user.avatar_update',
          targetId: target.id,
          detail: { contentType: stored.contentType, byteSize: stored.byteSize },
        })
        return {
          data: {
            avatarUrl: avatarApiUrl(target.id, stored.sha256),
            avatarVersion: avatarVersion(stored.sha256),
            contentType: stored.contentType,
            byteSize: stored.byteSize,
            source: stored.source,
          },
        }
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/api/users/:id/avatar',
      {
        schema: {
          tags: [TAG],
          summary: "Remove a console user's profile picture",
          description:
            'Remove a console account’s profile picture, whichever source it came from; the console then shows initials. Idempotent (`204` when there was none). Any signed-in user may remove their own; removing another user’s needs `users:manage`, with the same `403` escalation guards as uploading. A picture sourced from the identity provider comes back at the next SSO sign-in if the IdP still sends one. `404` for an unknown user. Writes a `user.avatar_delete` audit entry when a picture was removed.',
          operationId: 'users.avatar.delete',
          params: IdParam,
          response: {
            204: noContent,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const target = await adminStore.getUserById(request.params.id)
        if (!target) return reply.status(404).send({ error: 'User not found.' })
        const refusal = await refusalFor(request, target)
        if (refusal) return reply.status(403).send({ error: refusal })
        if (await avatars.delete(target.id)) {
          await adminStore.writeAudit({
            userId: request.jwtUser!.id,
            action: 'user.avatar_delete',
            targetId: target.id,
          })
        }
        return reply.status(204).send()
      },
    )
  }
}
