/**
 * Admin-only CRUD for runtime settings (the tunables that can change
 * without a redeploy). Mutations are gated on `adminOnly` — operator-
 * level users can read settings (so the wizard can show the active
 * mode) but cannot edit them.
 *
 *   GET    /api/runtime-settings           — list all rows
 *   PATCH  /api/runtime-settings/:key      — update one value
 *   DELETE /api/runtime-settings/:key      — reset to seeded default
 */
import type { FastifyPluginAsync } from 'fastify'
import { jwtOrServiceAuth } from '../auth/service-auth'
import { z } from 'zod'
import { validateServerVariables, type OpenApiServersConfig } from '@opensteward/shared'
import type { AdminStore } from '../db/admin-store'
import type { RuntimeSettingsStore } from '../db/runtime-settings-store'
import type { UnifiedClient } from '../proxy/client'
import type { IdentityStore } from '../db/identity-store'
import { assertBreakGlassPreserved, BreakGlassError } from '../auth/idp/break-glass'
import { RuntimeSetting, dataEnvelope, listEnvelope, errorBody } from './_openapi'
import {
  RuntimeSettingKeyParam,
  UpdateRuntimeSettingBody,
  type RuntimeSettingKey,
} from './_runtime-settings-schema.generated'

const TAG = 'runtime-settings'

function matchOpenapiServerKey(key: string): 'scheme' | 'host' | 'port' | 'version' | null {
  if (key === 'openapi.servers.scheme') return 'scheme'
  if (key === 'openapi.servers.host') return 'host'
  if (key === 'openapi.servers.port') return 'port'
  if (key === 'openapi.servers.version') return 'version'
  return null
}

export function createRuntimeSettingsRoutes(
  adminStore: AdminStore,
  unifiedClient: UnifiedClient,
  identityStore: IdentityStore,
  runtimeSettings: RuntimeSettingsStore,
): FastifyPluginAsync {
  return async function (fastify) {
    fastify.get(
      '/api/runtime-settings',
      {
        // Either a signed-in operator (the admin UI) or a sibling service
        // presenting the shared secret. The service path exists because
        // integration-server needs these values on its hot path and holds no
        // JWT_SECRET; see core/auth/service-auth.ts.
        preHandler: [jwtOrServiceAuth],
        schema: {
          tags: [TAG],
          summary: 'List runtime settings',
          description:
            'List all runtime settings (tunables that can change without a redeploy) with their current values. Any authenticated operator may read — so the setup wizard can show the active mode — but only admins may change them.',
          operationId: 'runtime-settings.list',
          response: {
            200: listEnvelope(RuntimeSetting),
            401: errorBody,
          },
        },
      },
      async () => {
        const data = await runtimeSettings.list()
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    fastify.patch<{ Params: { key: RuntimeSettingKey } }>(
      '/api/runtime-settings/:key',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Update a runtime setting value',
          description:
            'Update one runtime setting; the value type is validated against the seeded key. Admin role required. Returns `400` if the body `key` does not match the path key or the value fails validation, and `409` (break-glass) if disabling local login would leave no password-usable local admin. Takes effect promptly via cache invalidation and writes a `runtime_setting.update` audit entry.',
          operationId: 'runtime-settings.update',
          // Path param + body are both validated against the GENERATED
          // schemas built from RUNTIME_SETTINGS_SEEDS:
          //   - `RuntimeSettingKeyParam` pins `:key` to the seeded
          //     inventory so unknown keys 400 before the handler runs.
          //   - `UpdateRuntimeSettingBody` is a discriminated union on
          //     `key` with one branch per VALUE SHAPE (every number-valued
          //     setting shares a branch, and so on), so Swagger UI's
          //     Try-it-out shows a number input for
          //     `rate_limit.api_key.per_minute`, a checkbox for
          //     `auth.local_login_enabled`, etc. — operator-friendly forms
          //     without a component per setting.
          params: RuntimeSettingKeyParam,
          body: UpdateRuntimeSettingBody,
          response: {
            200: dataEnvelope(RuntimeSetting),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        // The Zod discriminated union has already validated that body.key
        // is one of the seeded keys AND body.value matches that key's
        // valueType. We still cross-check body.key against the path :key
        // — fastify-zod-openapi can't relate them at the spec level.
        const body = request.body as { key: RuntimeSettingKey; value: unknown }
        if (body.key !== request.params.key) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION',
              message: `Body key '${body.key}' must match path key '${request.params.key}'.`,
            },
          })
        }
        const value = body.value
        // Break-glass: refuse to disable local login if no password-usable
        // local admin would remain able to sign in.
        if (request.params.key === 'auth.local_login_enabled' && value === false) {
          try {
            await assertBreakGlassPreserved(adminStore, identityStore)
          } catch (err) {
            if (err instanceof BreakGlassError) {
              return reply
                .status(409)
                .send({ error: { code: 'BREAK_GLASS', message: err.message } })
            }
            throw err
          }
        }
        // The same shape of guard, for the developer API. Switching osk_ keys
        // off while OAuth cannot admit anybody locks every developer out of a
        // running deployment; the only way back in is X-Admin-Secret. Unlike
        // the local-login setting — whose description can only advise "once an
        // SSO provider is verified working" — this is checkable, so it is
        // checked: the issuer must be enabled, able to admit somebody, and have
        // actually verified a real token.
        if (request.params.key === 'auth.dev_api_keys_enabled' && value === false) {
          const oauthOn = (await runtimeSettings.get('auth.dev_oauth_enabled'))?.value === true
          if (!oauthOn) {
            return reply.status(409).send({
              error: {
                code: 'AUTH_LOCKOUT_REFUSED',
                message:
                  'Refusing to disable API keys while auth.dev_oauth_enabled is false — no ' +
                  'developer credential would be accepted.',
              },
            })
          }
          let readiness: { ready: boolean; reason: string }
          try {
            readiness = await unifiedClient.getOAuthReadiness()
          } catch (err) {
            // Unreachable integration-server means unproven, not proven.
            return reply.status(409).send({
              error: {
                code: 'AUTH_LOCKOUT_REFUSED',
                message:
                  'Refusing to disable API keys: could not confirm the OIDC configuration with ' +
                  `the integration-server (${err instanceof Error ? err.message : String(err)}).`,
              },
            })
          }
          if (!readiness.ready) {
            return reply.status(409).send({
              error: {
                code: 'AUTH_LOCKOUT_REFUSED',
                message: `Refusing to disable API keys: ${readiness.reason}`,
              },
            })
          }
        }
        const openapiKey = matchOpenapiServerKey(request.params.key)
        if (openapiKey) {
          try {
            validateServerVariables({ [openapiKey]: value } as OpenApiServersConfig)
          } catch (err) {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION',
                message: err instanceof Error ? err.message : String(err),
              },
            })
          }
        }
        try {
          const before = await runtimeSettings.get(request.params.key)
          const updated = await runtimeSettings.set(request.params.key, value, request.jwtUser!.id)
          await adminStore.writeAudit(
            request.jwtUser!.id,
            'runtime_setting.update',
            undefined,
            request.params.key,
            { before: before?.value, after: updated.value },
          )
          // Best-effort cache invalidation so the change applies sooner
          // than the 60 s TTL on the integration-server's client.
          void unifiedClient.refreshRuntimeSettings()
          return { data: updated }
        } catch (err) {
          return reply.status(400).send({
            error: {
              code: 'RUNTIME_SETTING_UPDATE_FAILED',
              message: err instanceof Error ? err.message : String(err),
            },
          })
        }
      },
    )

    fastify.delete<{ Params: { key: RuntimeSettingKey } }>(
      '/api/runtime-settings/:key',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Reset a runtime setting to its seeded default',
          description:
            'Reset a runtime setting back to its seeded default value. Admin role required. Returns `404` if the key is unknown. Writes a `runtime_setting.reset` audit entry and invalidates the downstream settings cache.',
          operationId: 'runtime-settings.reset',
          // Same seeded-inventory enum on `:key` as the PATCH route.
          params: RuntimeSettingKeyParam,
          response: {
            200: dataEnvelope(RuntimeSetting),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        try {
          const before = await runtimeSettings.get(request.params.key)
          const reset = await runtimeSettings.reset(request.params.key, request.jwtUser!.id)
          await adminStore.writeAudit(
            request.jwtUser!.id,
            'runtime_setting.reset',
            undefined,
            request.params.key,
            { before: before?.value, after: reset.value },
          )
          void unifiedClient.refreshRuntimeSettings()
          return { data: reset }
        } catch (err) {
          return reply.status(404).send({
            error: {
              code: 'RUNTIME_SETTING_NOT_FOUND',
              message: err instanceof Error ? err.message : String(err),
            },
          })
        }
      },
    )
  }
}
