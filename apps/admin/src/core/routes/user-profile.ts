/**
 * Console-user profile: email and profile picture.
 *
 *   GET  /users/:id/avatar         — the picture, same-origin (any signed-in user)
 *   POST /users/:id/email          — set or clear the email          (admin)
 *   POST /users/:id/avatar         — upload a picture, multipart     (admin)
 *   POST /users/:id/avatar/delete  — remove the picture              (admin)
 *   GET  /profile                  — my own profile                  (any signed-in user)
 *   POST /profile/avatar           — upload my own picture, multipart (any signed-in user)
 *   POST /profile/avatar/delete    — remove my own picture           (any signed-in user)
 *
 * Pictures are proxied rather than linked to admin-api: the browser never
 * talks to admin-api, and the pages that set a CSP allow `img-src 'self'`
 * only. The proxy passes through only the three image types admin-api
 * stores, and re-states the headers admin-api sends (nosniff, a
 * `default-src 'none'` CSP, private caching, the ETag).
 *
 * The `/users/:id/…` writes sit on the admin-only user detail page, like
 * every other user edit here. `/profile` is the self-service page any
 * signed-in user reaches from the header: its routes take no id and act on
 * the session's own account only. admin-api is the real gate either way: it
 * lets anyone change their own picture and requires users:manage (plus the
 * escalation and tenant-scope guards) for anyone else's, and sniffs the
 * bytes — this side never trusts the browser's content type either.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { requireAuth, requireRole } from '../auth/middleware'
import { flashError, flashSuccess } from '../flash'
import { acceptMultipart, isUploadedFile, type MultipartBody } from '../multipart'
import type { AdminApiClient } from '../proxy/admin-api-client'

/** Mirrors admin-api's cap, so an obviously oversized file is refused here
 *  with a message instead of a round trip. admin-api enforces it anyway. */
export const AVATAR_MAX_BYTES = 512 * 1024

/** Whole multipart body: the picture, the CSRF field and boundaries. */
const MULTIPART_MAX_BYTES = AVATAR_MAX_BYTES + 64 * 1024

const SERVED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

/** `GET /users/<id>/avatar[?v=…]` — the one path the shell-data hooks skip. */
export const AVATAR_PATH = /^\/users\/[^/?#]+\/avatar(?:\?.*)?$/

function apiError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: unknown } }; message?: string }
  const raw = e?.response?.data?.error
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object' && 'message' in raw) return String((raw as { message: unknown }).message)
  return e?.message ?? fallback
}

export interface UserProfileRoutesOptions {
  /**
   * Drop the shell's cached `/api/auth/me` for a session token. The header
   * draws the signed-in user's picture from that cache (30 s per token), so
   * without this a new picture shows only after the entry expires or the
   * user signs in again.
   */
  forgetSessionAccess?: (token: string) => void
}

export function createUserProfileRoutes(apiClient: AdminApiClient, opts: UserProfileRoutesOptions = {}) {
  /** After a change to the signed-in user's own picture, redraw the header from fresh data. */
  function refreshOwnHeader(request: FastifyRequest, userId: string) {
    const me = request.sessionUser!
    if (userId === me.id) opts.forgetSessionAccess?.(me.token)
  }

  /** Forward an uploaded picture for `userId`, flash the outcome, go `back`. */
  async function uploadAvatar(
    request: FastifyRequest<{ Body: MultipartBody }>,
    reply: FastifyReply,
    userId: string,
    back: string,
  ) {
    const token = request.sessionUser!.token
    const file = request.body?.['avatar']
    if (!isUploadedFile(file) || file.bytes.length === 0) {
      flashError(reply, 'Choose a PNG, JPEG or WebP picture to upload.')
    } else if (file.bytes.length > AVATAR_MAX_BYTES) {
      flashError(reply, `The picture is larger than ${AVATAR_MAX_BYTES / 1024} KB.`)
    } else {
      try {
        // Plain base64: the browser's declared type is not forwarded.
        await apiClient.setUserAvatar(token, userId, file.bytes.toString('base64'))
        refreshOwnHeader(request, userId)
        flashSuccess(reply, 'Picture updated.')
      } catch (err) {
        flashError(reply, apiError(err, 'The picture was refused.'))
      }
    }
    return reply.redirect(back)
  }

  async function removeAvatar(request: FastifyRequest, reply: FastifyReply, userId: string, back: string) {
    try {
      await apiClient.deleteUserAvatar(request.sessionUser!.token, userId)
      refreshOwnHeader(request, userId)
      flashSuccess(reply, 'Picture removed.')
    } catch (err) {
      flashError(reply, apiError(err, 'Failed to remove the picture.'))
    }
    return reply.redirect(back)
  }

  return async function userProfileRoutes(fastify: FastifyInstance): Promise<void> {
    // ── Read: every signed-in user sees everyone's picture ────────────────
    await fastify.register(async (reads) => {
      reads.addHook('preHandler', requireAuth)

      reads.get<{ Params: { id: string } }>('/users/:id/avatar', async (request, reply) => {
        const token = request.sessionUser!.token
        const inm = request.headers['if-none-match']
        reply
          .header('x-content-type-options', 'nosniff')
          .header('content-security-policy', "default-src 'none'")
        let pic: Awaited<ReturnType<AdminApiClient['getUserAvatar']>>
        try {
          pic = await apiClient.getUserAvatar(
            token,
            request.params.id,
            typeof inm === 'string' ? inm : undefined,
          )
        } catch (err) {
          // An <img> cannot show an error page, and a 401 bounced to /login
          // would be fetched as an "image". An empty 502 costs one broken
          // picture; the page around it reports the outage itself.
          request.log.warn({ err }, 'avatar proxy failed')
          return reply.code(502).send()
        }
        reply.header('cache-control', 'private, max-age=300')
        if (!pic) return reply.code(404).send()
        if (pic.etag) reply.header('etag', pic.etag)
        if (pic.status === 304) return reply.code(304).send()
        if (!pic.contentType || !SERVED_TYPES.has(pic.contentType)) return reply.code(502).send()
        return reply.type(pic.contentType).send(pic.bytes)
      })
    })

    // ── Writes: the admin-only detail page ────────────────────────────────
    await fastify.register(async (writes) => {
      writes.addHook('preHandler', requireRole('admin'))
      acceptMultipart(writes, MULTIPART_MAX_BYTES)

      writes.post<{ Params: { id: string }; Body: { email?: string } }>(
        '/users/:id/email',
        async (request, reply) => {
          const token = request.sessionUser!.token
          const email = String(request.body?.email ?? '').trim()
          try {
            // Blank clears it; admin-api validates the address.
            await apiClient.updateUser(token, request.params.id, { email: email || null })
            flashSuccess(reply, email ? 'Email saved.' : 'Email cleared.')
          } catch (err) {
            flashError(reply, apiError(err, 'Failed to save the email.'))
          }
          return reply.redirect(`/users/${encodeURIComponent(request.params.id)}`)
        },
      )

      writes.post<{ Params: { id: string }; Body: MultipartBody }>('/users/:id/avatar', (request, reply) =>
        uploadAvatar(request, reply, request.params.id, `/users/${encodeURIComponent(request.params.id)}`),
      )

      writes.post<{ Params: { id: string } }>('/users/:id/avatar/delete', (request, reply) =>
        removeAvatar(request, reply, request.params.id, `/users/${encodeURIComponent(request.params.id)}`),
      )
    })

    // ── Self-service: my own profile, any signed-in user ─────────────────
    await fastify.register(async (self) => {
      self.addHook('preHandler', requireAuth)
      acceptMultipart(self, MULTIPART_MAX_BYTES)

      self.get('/profile', async (request, reply) => {
        const me = await apiClient.getMyProfile(request.sessionUser!.token)
        return reply.view('profile.ejs', {
          user: request.sessionUser,
          // Fall back to the session so the page renders if /me is unavailable.
          me: me ?? { id: request.sessionUser!.id, username: request.sessionUser!.username, email: null },
          csrfToken: (request as { csrfToken?: string }).csrfToken,
        })
      })

      // No id in these paths: always the session's own account.
      self.post<{ Body: MultipartBody }>('/profile/avatar', (request, reply) =>
        uploadAvatar(request, reply, request.sessionUser!.id, '/profile'),
      )
      self.post('/profile/avatar/delete', (request, reply) =>
        removeAvatar(request, reply, request.sessionUser!.id, '/profile'),
      )
    })
  }
}
