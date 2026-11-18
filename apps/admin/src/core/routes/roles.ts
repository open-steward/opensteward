/**
 * Admin UI for roles — the three built-ins plus operator-defined custom roles.
 *
 *   GET   /roles               list roles with their permissions
 *   GET   /roles/new           create form
 *   POST  /roles               create a custom role
 *   GET   /roles/:id           edit form (read-only for a built-in)
 *   POST  /roles/:id           save a custom role
 *   POST  /roles/:id/delete    delete an unused custom role
 *
 * Every page needs `roles:manage`. admin-api enforces the same permission and
 * the escalation guards (no permission or base role you do not hold); this
 * surface only relays its refusals as flash messages.
 */
import type { FastifyInstance } from 'fastify'
import { requirePermission } from '../auth/middleware'
import { flashError, flashSuccess } from '../flash'
import type { AdminApiClient, RoleRecord } from '../proxy/admin-api-client'

function apiError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: unknown } }; message?: string }
  const raw = e?.response?.data?.error
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object' && 'message' in raw)
    return String((raw as { message: unknown }).message)
  return e?.message ?? fallback
}

/** A checkbox group posts one string, several strings, or nothing. */
function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string' && value) return [value]
  return []
}

interface RoleForm {
  name?: string
  description?: string
  baseRole?: string
  permissions?: string | string[]
}

export function createRolesRoutes(apiClient: AdminApiClient) {
  return async function rolesRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', requirePermission('roles:manage'))

    fastify.get('/roles', async (request, reply) => {
      const token = request.sessionUser!.token
      const [roles, permissions] = await Promise.all([
        apiClient.listRoles(token),
        apiClient.listPermissions(token),
      ])
      return reply.view('roles/index.ejs', { user: request.sessionUser, roles, permissions })
    })

    const renderForm = async (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply,
      role: RoleRecord | null,
    ) => {
      const permissions = await apiClient.listPermissions(request.sessionUser!.token)
      // `csrfToken` reaches the view through reply.locals (server.ts).
      return reply.view('roles/edit.ejs', {
        user: request.sessionUser,
        role,
        permissions,
      })
    }

    fastify.get('/roles/new', async (request, reply) => renderForm(request, reply, null))

    fastify.post<{ Body: RoleForm }>('/roles', async (request, reply) => {
      const body = request.body ?? {}
      try {
        const role = await apiClient.createRole(request.sessionUser!.token, {
          name: (body.name ?? '').trim(),
          description: (body.description ?? '').trim() || null,
          baseRole: body.baseRole ?? 'viewer',
          permissions: asList(body.permissions),
        })
        flashSuccess(reply, `Role "${role.name}" created.`)
        return reply.redirect('/roles')
      } catch (err) {
        flashError(reply, apiError(err, 'Failed to create role.'))
        return reply.redirect('/roles/new')
      }
    })

    fastify.get<{ Params: { id: string } }>('/roles/:id', async (request, reply) => {
      const role = await apiClient.getRole(request.sessionUser!.token, request.params.id)
      if (!role) {
        return reply.status(404).view('error.ejs', {
          user: request.sessionUser,
          status: 404,
          message: 'No role with this id exists.',
          requestId: null,
        })
      }
      return renderForm(request, reply, role)
    })

    fastify.post<{ Params: { id: string }; Body: RoleForm }>(
      '/roles/:id',
      async (request, reply) => {
        const body = request.body ?? {}
        const id = request.params.id
        try {
          await apiClient.updateRole(request.sessionUser!.token, id, {
            name: (body.name ?? '').trim() || undefined,
            description: (body.description ?? '').trim() || null,
            baseRole: body.baseRole || undefined,
            permissions: asList(body.permissions),
          })
          flashSuccess(reply, 'Role saved.')
          return reply.redirect('/roles')
        } catch (err) {
          flashError(reply, apiError(err, 'Failed to save role.'))
          return reply.redirect(`/roles/${encodeURIComponent(id)}`)
        }
      },
    )

    fastify.post<{ Params: { id: string } }>('/roles/:id/delete', async (request, reply) => {
      try {
        await apiClient.deleteRole(request.sessionUser!.token, request.params.id)
        flashSuccess(reply, 'Role deleted.')
      } catch (err) {
        flashError(reply, apiError(err, 'Failed to delete role.'))
      }
      return reply.redirect('/roles')
    })
  }
}
