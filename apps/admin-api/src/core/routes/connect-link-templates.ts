import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AdminStore, ConnectLinkTemplateMode, ConnectLinkTemplateAllowedPlatform } from '../db/admin-store'
import { AllowedPlatform, ConnectLinkMode, ConnectLinkTemplate, dataEnvelope, listEnvelope, errorBody, noContent } from './_openapi'
import { denyRestrictedScope } from '../auth/access'

const TAG = 'connect-link-templates'

const MODES: ReadonlyArray<ConnectLinkTemplateMode> = ['pinned', 'customer-picks-adapter', 'self-register']

function isMode(v: unknown): v is ConnectLinkTemplateMode {
  return typeof v === 'string' && (MODES as readonly string[]).includes(v)
}

function normalizeStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return [...new Set(input.map((v) => String(v).trim()).filter(Boolean))]
  }
  return []
}

function normalizePlatforms(input: unknown): ConnectLinkTemplateAllowedPlatform[] {
  if (!Array.isArray(input)) return []
  const out: ConnectLinkTemplateAllowedPlatform[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const vertical = String((item as { vertical?: unknown }).vertical ?? '').trim()
    const slug = String((item as { slug?: unknown }).slug ?? '').trim()
    if (!vertical || !slug) continue
    out.push({ vertical, slug })
  }
  return out
}

const ListQuery = z.object({ tenantId: z.string().optional() })
const IdParam = z.object({ id: z.string() })

const CreateBody = z.object({
  tenantId: z.string().min(1).meta({ description: 'Tenant (operator customer) that will own the template.', example: 'acme' }),
  name: z.string().min(1).meta({ description: 'Human-friendly name for the template.', example: 'Acme onboarding' }),
  description: z.string().nullable().optional().meta({ description: 'Optional longer description of the template.', example: 'Onboarding link for Acme Industries.' }),
  linkMode: ConnectLinkMode.meta({ description: 'How the customer chooses what to connect: `pinned`, `customer-picks-adapter`, or `self-register`.', example: 'pinned' }),
  allowedVerticals: z.array(z.string()).optional().meta({ description: 'Verticals the customer may connect; required/used depending on `linkMode`.', example: ['accounting'] }),
  allowedPlatforms: z.array(AllowedPlatform).optional().meta({ description: 'Specific platforms the customer may connect; required for `pinned` mode.', example: [{ vertical: 'accounting', slug: 'xero' }] }),
  scopeGroupId: z.number().nullable().optional().meta({ description: 'Scope group whose scopes generated links request; omit for defaults.', example: 7 }),
  expiryDays: z.number().optional().meta({ description: 'Days a generated link stays valid before expiring; omit for the default.', example: 7 }),
  oneTimeOnly: z.boolean().optional().meta({ description: 'When true, generated links are consumed after a single successful connection.', example: false }),
  redirectUrl: z.string().nullable().optional().meta({ description: 'URL the customer returns to after connecting; omit for the default.', example: 'https://app.acme.example/return' }),
}).meta({ id: 'CreateConnectLinkTemplateBody', description: 'Request body to create a connect-link template.' })

const UpdateBody = z.object({
  name: z.string().optional().meta({ description: 'New name for the template.', example: 'Acme onboarding' }),
  description: z.string().nullable().optional().meta({ description: 'New description; pass null to clear it.', example: 'Onboarding link for Acme Industries.' }),
  linkMode: ConnectLinkMode.optional().meta({ description: 'New link mode controlling what the customer can connect.', example: 'pinned' }),
  allowedVerticals: z.array(z.string()).optional().meta({ description: 'New set of verticals the customer may connect.', example: ['accounting'] }),
  allowedPlatforms: z.array(AllowedPlatform).optional().meta({ description: 'New set of platforms the customer may connect.', example: [{ vertical: 'accounting', slug: 'xero' }] }),
  scopeGroupId: z.number().nullable().optional().meta({ description: 'New scope group; pass null to clear it.', example: 7 }),
  expiryDays: z.number().optional().meta({ description: 'New link validity window in days.', example: 7 }),
  oneTimeOnly: z.boolean().optional().meta({ description: 'Whether generated links should be single-use.', example: false }),
  redirectUrl: z.string().nullable().optional().meta({ description: 'New post-connect redirect URL; pass null to clear it.', example: 'https://app.acme.example/return' }),
}).meta({ id: 'UpdateConnectLinkTemplateBody', description: 'Request body to update a connect-link template; omitted fields are left unchanged.' })

export function createConnectLinkTemplatesRoutes(adminStore: AdminStore) {
  return async function connectLinkTemplatesRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)
    // Not tenant-scoped yet: a tenant-restricted caller is refused outright
    // (403 SCOPE_RESTRICTED) rather than shown every tenant's rows.
    fastify.addHook('preHandler', denyRestrictedScope)

    fastify.get<{ Querystring: { tenantId?: string } }>(
      '/api/connect-link-templates',
      {
        schema: {
          tags: [TAG],
          summary: 'List Connect Link templates',
          description:
            'List Connect Link templates (reusable presets that define what a generated link lets a customer connect), optionally filtered by `tenantId`. Any authenticated operator.',
          operationId: 'connect-link-templates.list',
          querystring: ListQuery,
          response: {
            200: listEnvelope(ConnectLinkTemplate),
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request) => {
        const { tenantId } = request.query
        const data = await adminStore.listConnectLinkTemplates({ tenantId })
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    fastify.get<{ Params: { id: string } }>(
      '/api/connect-link-templates/:id',
      {
        schema: {
          tags: [TAG],
          summary: 'Read one Connect Link template',
          description:
            'Read a single Connect Link template by id. Any authenticated operator. Returns `400` for a non-numeric id and `404` if the template does not exist.',
          operationId: 'connect-link-templates.get',
          params: IdParam,
          response: {
            200: dataEnvelope(ConnectLinkTemplate),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const id = parseInt(request.params.id, 10)
        if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })
        const tpl = await adminStore.getConnectLinkTemplate(id)
        if (!tpl) return reply.status(404).send({ error: 'Template not found' })
        return { data: tpl }
      },
    )

    fastify.post<{
      Body: {
        tenantId?: string
        name?: string
        description?: string | null
        linkMode?: string
        allowedVerticals?: unknown
        allowedPlatforms?: unknown
        scopeGroupId?: number | null
        expiryDays?: number
        oneTimeOnly?: boolean
        redirectUrl?: string | null
      }
    }>(
      '/api/connect-link-templates',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'Create a Connect Link template',
          description:
            'Create a Connect Link template defining the link mode, allowed verticals/platforms, scope group, expiry, and redirect for links generated from it. Operator role or higher. Returns `400` if `tenantId`/`name` is missing or `linkMode` is invalid, and `409` if a template with that name already exists for the tenant. Writes a `connect_link_template.create` audit entry.',
          operationId: 'connect-link-templates.create',
          body: CreateBody,
          response: {
            201: dataEnvelope(ConnectLinkTemplate),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            409: errorBody,
            500: errorBody,
          },
        },
      },
      async (request, reply) => {
        const body = request.body ?? {}
        const tenantId = (body.tenantId ?? '').trim()
        const name = (body.name ?? '').trim()
        if (!tenantId || !name) {
          return reply.status(400).send({ error: 'tenantId and name are required' })
        }
        if (!isMode(body.linkMode)) {
          return reply.status(400).send({ error: `linkMode must be one of ${MODES.join(', ')}` })
        }
        try {
          const tpl = await adminStore.createConnectLinkTemplate({
            tenantId,
            name,
            description: body.description?.toString().trim() || null,
            linkMode: body.linkMode,
            allowedVerticals: normalizeStringArray(body.allowedVerticals),
            allowedPlatforms: normalizePlatforms(body.allowedPlatforms),
            scopeGroupId:
              typeof body.scopeGroupId === 'number' && Number.isFinite(body.scopeGroupId)
                ? body.scopeGroupId
                : null,
            expiryDays: typeof body.expiryDays === 'number' ? body.expiryDays : 7,
            oneTimeOnly: !!body.oneTimeOnly,
            redirectUrl: body.redirectUrl?.toString().trim() || null,
            createdBy: request.jwtUser!.id,
          })
          await adminStore.writeAudit(request.jwtUser!.id, 'connect_link_template.create', undefined, String(tpl.id), { name, tenantId })
          return reply.status(201).send({ data: tpl })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (message.includes('UNIQUE')) {
            return reply.status(409).send({ error: 'A template with that name already exists for this tenant' })
          }
          return reply.status(500).send({ error: 'Failed to create template', detail: message })
        }
      },
    )

    fastify.put<{
      Params: { id: string }
      Body: Partial<{
        name: string
        description: string | null
        linkMode: string
        allowedVerticals: unknown
        allowedPlatforms: unknown
        scopeGroupId: number | null
        expiryDays: number
        oneTimeOnly: boolean
        redirectUrl: string | null
      }>
    }>(
      '/api/connect-link-templates/:id',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'Update a Connect Link template',
          description:
            'Update a Connect Link template; omitted fields are left unchanged. Operator role or higher. Returns `400` for a non-numeric id or invalid `linkMode`, and `404` if the template does not exist. Writes a `connect_link_template.update` audit entry.',
          operationId: 'connect-link-templates.update',
          params: IdParam,
          body: UpdateBody,
          response: {
            200: dataEnvelope(ConnectLinkTemplate),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const id = parseInt(request.params.id, 10)
        if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })
        const body = request.body ?? {}
        const patch: Parameters<AdminStore['updateConnectLinkTemplate']>[1] = {}
        if (typeof body.name === 'string') patch.name = body.name.trim()
        if (body.description !== undefined) patch.description = body.description?.toString().trim() || null
        if (body.linkMode !== undefined) {
          if (!isMode(body.linkMode)) return reply.status(400).send({ error: `linkMode must be one of ${MODES.join(', ')}` })
          patch.linkMode = body.linkMode
        }
        if (body.allowedVerticals !== undefined) patch.allowedVerticals = normalizeStringArray(body.allowedVerticals)
        if (body.allowedPlatforms !== undefined) patch.allowedPlatforms = normalizePlatforms(body.allowedPlatforms)
        if (body.scopeGroupId !== undefined) {
          patch.scopeGroupId = typeof body.scopeGroupId === 'number' && Number.isFinite(body.scopeGroupId) ? body.scopeGroupId : null
        }
        if (typeof body.expiryDays === 'number') patch.expiryDays = body.expiryDays
        if (body.oneTimeOnly !== undefined) patch.oneTimeOnly = !!body.oneTimeOnly
        if (body.redirectUrl !== undefined) patch.redirectUrl = body.redirectUrl?.toString().trim() || null

        const updated = await adminStore.updateConnectLinkTemplate(id, patch)
        if (!updated) return reply.status(404).send({ error: 'Template not found' })
        await adminStore.writeAudit(request.jwtUser!.id, 'connect_link_template.update', undefined, String(updated.id), { name: updated.name, tenantId: updated.tenantId })
        return { data: updated }
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/api/connect-link-templates/:id',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'Delete a Connect Link template',
          description:
            'Delete a Connect Link template by id. Operator role or higher. Returns `400` for a non-numeric id and `404` if the template does not exist. Writes a `connect_link_template.delete` audit entry.',
          operationId: 'connect-link-templates.delete',
          params: IdParam,
          response: {
            204: noContent,
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const id = parseInt(request.params.id, 10)
        if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })
        const existing = await adminStore.getConnectLinkTemplate(id)
        if (!existing) return reply.status(404).send({ error: 'Template not found' })
        await adminStore.deleteConnectLinkTemplate(id)
        await adminStore.writeAudit(request.jwtUser!.id, 'connect_link_template.delete', undefined, String(existing.id), { name: existing.name, tenantId: existing.tenantId })
        return reply.status(204).send()
      },
    )
  }
}
