import type { FastifyInstance } from 'fastify'
import { reference } from '@opensteward/shared'
import { requireRole } from '../auth/middleware'
import { flashSuccess } from '../flash'
import type { AdminApiClient, CompanyInfo } from '../proxy/admin-api-client'

const COUNTRY_OPTIONS = reference.COUNTRY_OPTIONS

const FIELDS: Array<keyof CompanyInfo> = [
  'name',
  'legalName',
  'description',
  'website',
  'logoDataUrl',
  'primaryColor',
  'secondaryColor',
  'fontFamily',
  'fontDataUrl',
  'fontUrl',
  'faviconDataUrl',
  'hideAttribution',
  'supportEmail',
  'privacyPolicyUrl',
  'termsOfServiceUrl',
  'addressLine1',
  'addressLine2',
  'city',
  'region',
  'postalCode',
  'country',
  'baseUrl',
]

/**
 * Build a clean patch object from form-urlencoded body. Fields not present
 * in the body are omitted (so missing values don't accidentally clear them).
 * Empty string is preserved (the API treats it as a clear).
 */
function bodyToPatch(body: Record<string, unknown>): Partial<CompanyInfo> {
  const patch: Record<string, unknown> = {}
  for (const key of FIELDS) {
    if (!(key in body)) continue
    // `hideAttribution` rides a hidden input carrying 'true'/'false' (a bare
    // checkbox would simply omit the key when off, making it impossible to
    // turn back off). Coerce to a real boolean so the API's schema accepts it.
    if (key === 'hideAttribution') {
      patch[key] = body[key] === 'true' || body[key] === true
      continue
    }
    patch[key] = body[key]
  }
  return patch as Partial<CompanyInfo>
}

export function createCompanyInfoRoutes(apiClient: AdminApiClient) {
  return async function companyInfoRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', requireRole('admin'))

    fastify.get('/company-info', async (request, reply) => {
      const token = request.sessionUser!.token
      const company = await apiClient.getCompanyInfo(token)
      return reply.view('company-info/edit.ejs', {
        user: request.sessionUser,
        company: company ?? {},
        countries: COUNTRY_OPTIONS,
        error: null,
        success: false,
        csrfToken: (request as any).csrfToken,
      })
    })

    fastify.post<{ Body: Record<string, unknown> }>('/company-info', async (request, reply) => {
      const token = request.sessionUser!.token
      const patch = bodyToPatch(request.body ?? {})
      try {
        const updated = await apiClient.setCompanyInfo(token, patch)
        return reply.view('company-info/edit.ejs', {
          user: request.sessionUser,
          company: updated,
          countries: COUNTRY_OPTIONS,
          error: null,
          success: true,
          csrfToken: (request as any).csrfToken,
        })
      } catch (err: any) {
        const apiError = err?.response?.data?.error ?? err?.message ?? 'Failed to save company info'
        return reply.view('company-info/edit.ejs', {
          user: request.sessionUser,
          company: { ...patch },
          countries: COUNTRY_OPTIONS,
          error: apiError,
          success: false,
          csrfToken: (request as any).csrfToken,
        })
      }
    })

    /**
     * Reset to the defaults OpenSteward ships with: admin-api deletes the
     * record, so every branded surface falls back to OpenSteward's own and
     * the setup wizard's Branding step reads as not done again. The button
     * confirms in the browser first (`data-confirm`).
     *
     * No try/catch, like every destructive action here: a reset that failed
     * goes to the error page with the upstream reason, rather than a redirect
     * and a banner that would read as proof the branding is gone.
     */
    fastify.post('/company-info/reset', async (request, reply) => {
      await apiClient.resetCompanyInfo(request.sessionUser!.token)
      flashSuccess(reply, 'Company info reset to the defaults.')
      return reply.redirect('/company-info')
    })
  }
}
