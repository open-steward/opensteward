/**
 * @opensteward/sdk — official TypeScript SDK for OpenSteward.
 *
 * Two clients in one package:
 *
 *   - `createPublicClient`   — tenant developers calling the
 *                              `/v1/*` integration-server surface (Bearer API key).
 *   - `createOperatorClient` — operators / CLI calling `admin-api`
 *                              (JWT login + role-gated).
 *
 * The typed surface for each is generated from the committed OpenAPI
 * specs by `pnpm sdk:generate`; see `./generated/*-types.ts`. Bumping
 * the spec and re-running the generator is the only way to add or
 * remove operations from this package.
 */
export { createPublicClient, clientCredentialsTokenSource, basePathFor } from './public.js'
export type {
  ApiMode,
  CreatePublicClientOptions,
  ApiKeyClientOptions,
  TokenClientOptions,
  ClientCredentialsOptions,
  PublicClient,
} from './public.js'

export { createOperatorClient } from './operator.js'
export type { CreateOperatorClientOptions, CredentialsFile, OperatorClient } from './operator.js'

// Re-export the raw generated `paths` types so advanced consumers can
// derive their own helper types (per-operation request / response).
export type { paths as PublicPaths } from './generated/public-types.js'
export type { paths as OperatorPaths } from './generated/operator-types.js'
