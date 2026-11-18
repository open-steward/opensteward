/**
 * Company info routes — operator-level branding and developer-portal helper data.
 *
 * Routes:
 *   GET /api/company-info        — any authenticated user can read (so the
 *                                  admin frontend can render the navbar logo
 *                                  for non-admins)
 *   GET /api/company-info/public — UNAUTHENTICATED. Returns only the
 *                                  branding subset (name, logo, primary
 *                                  colour, support email, privacy/ToS
 *                                  links, baseUrl). Consumed by the
 *                                  Connect Link page on integration-server
 *                                  to render the host's brand.
 *   PUT /api/company-info        — admin only; upserts the single record
 *                                  and writes an audit log entry
 *   DELETE /api/company-info     — admin only; deletes the record, back to the
 *                                  shipped defaults, and writes an audit entry
 */
import type { FastifyInstance } from 'fastify'
import { CompanyInfoSchema, type CompanyInfoRecord as CompanyInfoRecordType } from '@opensteward/shared'
import type { AdminStore } from '../db/admin-store'
import {
  CompanyInfoInput,
  CompanyInfoRecord,
  PublicCompanyInfo,
  dataEnvelope,
  dataNullable,
  errorBody,
  noContent,
} from './_openapi'

const TAG = 'company-info'

interface PublicCompanyInfoShape {
  name: string | null
  logoDataUrl: string | null
  primaryColor: string | null
  secondaryColor: string | null
  fontFamily: string | null
  fontDataUrl: string | null
  fontUrl: string | null
  faviconDataUrl: string | null
  hideAttribution: boolean
  supportEmail: string | null
  privacyPolicyUrl: string | null
  termsOfServiceUrl: string | null
  baseUrl: string | null
}

function toPublic(info: CompanyInfoRecordType | null): PublicCompanyInfoShape {
  if (!info) {
    return {
      name: null,
      logoDataUrl: null,
      primaryColor: null,
      secondaryColor: null,
      fontFamily: null,
      fontDataUrl: null,
      fontUrl: null,
      faviconDataUrl: null,
      hideAttribution: false,
      supportEmail: null,
      privacyPolicyUrl: null,
      termsOfServiceUrl: null,
      baseUrl: null,
    }
  }
  // Explicit allow-list — never spread the record so we can't leak fields by
  // accident when the schema gains new ones.
  return {
    name: info.name ?? null,
    logoDataUrl: info.logoDataUrl ?? null,
    primaryColor: info.primaryColor ?? null,
    secondaryColor: info.secondaryColor ?? null,
    fontFamily: info.fontFamily ?? null,
    fontDataUrl: info.fontDataUrl ?? null,
    fontUrl: info.fontUrl ?? null,
    faviconDataUrl: info.faviconDataUrl ?? null,
    hideAttribution: info.hideAttribution ?? false,
    supportEmail: info.supportEmail ?? null,
    privacyPolicyUrl: info.privacyPolicyUrl ?? null,
    termsOfServiceUrl: info.termsOfServiceUrl ?? null,
    baseUrl: info.baseUrl ?? null,
  }
}

export function createCompanyInfoRoutes(adminStore: AdminStore) {
  return async function companyInfoRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get(
      '/api/company-info',
      {
        preHandler: [fastify.authenticate],
        schema: {
          tags: [TAG],
          summary: 'Read the company-info record (auth-required)',
          description:
            'Read the full company-info record (branding plus operator settings) so the admin UI can render the navbar logo and settings forms. Any authenticated operator. Returns `data: null` when no record has been saved yet.',
          operationId: 'company-info.get',
          response: {
            200: dataNullable(CompanyInfoRecord),
            401: errorBody,
          },
        },
      },
      async () => {
        return { data: await adminStore.getCompanyInfo() }
      },
    )

    // Unauthenticated branding endpoint. integration-server fetches this
    // server-to-server (via ADMIN_API_URL on the Docker network) so the
    // hosted Connect Link page can render the host's name/logo/colour.
    fastify.get(
      '/api/company-info/public',
      {
        schema: {
          tags: [TAG],
          summary: 'Public branding subset (no auth)',
          description:
            'Return only the public branding subset (name, logo, colours, support email, privacy/ToS links, base URL) with **no authentication**. Consumed server-to-server by the hosted Connect Link page to render the host\'s brand. Sensitive operator settings are never exposed here.',
          operationId: 'company-info.get-public',
          response: {
            200: dataEnvelope(PublicCompanyInfo),
          },
          security: [],
        },
      },
      async () => {
        return { data: toPublic(await adminStore.getCompanyInfo()) }
      },
    )

    fastify.put(
      '/api/company-info',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Upsert the company-info record',
          description:
            'Create or replace the single company-info record (branding and operator settings). Admin role required. Returns `400` with validation issues if the body fails schema validation. Writes a `company_info.update` audit entry.',
          operationId: 'company-info.update',
          body: CompanyInfoInput,
          response: {
            200: dataEnvelope(CompanyInfoRecord),
            400: errorBody,
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request, reply) => {
        const parsed = CompanyInfoSchema.safeParse(request.body ?? {})
        if (!parsed.success) {
          const first = parsed.error.issues[0]
          const path = first?.path.join('.') ?? 'body'
          return reply.status(400).send({
            error: `Invalid ${path}: ${first?.message ?? 'validation failed'}`,
            issues: parsed.error.issues,
          })
        }
        const result = await adminStore.upsertCompanyInfo(parsed.data, request.jwtUser!.id)
        await adminStore.writeAudit(request.jwtUser!.id, 'company_info.update')
        return { data: result }
      },
    )

    fastify.delete(
      '/api/company-info',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Reset the company-info record to the defaults',
          description:
            'Delete the company-info record (branding and operator settings), returning the deployment to the defaults it ships with: `GET /api/company-info` answers `data: null` again and every branded surface falls back to OpenSteward\'s own. Admin role required. Idempotent — resetting when nothing is saved also answers `204`. Writes a `company_info.reset` audit entry.',
          operationId: 'company-info.reset',
          response: {
            204: noContent,
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request, reply) => {
        await adminStore.deleteCompanyInfo()
        await adminStore.writeAudit(request.jwtUser!.id, 'company_info.reset')
        return reply.status(204).send()
      },
    )
  }
}
