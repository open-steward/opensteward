/**
 * FastifyRequest augmentation for the unified service.
 *
 * Ambient .d.ts (no top-level import/export) so TypeScript auto-loads it for
 * module augmentation. `adapter` and `credentials` are typed loosely because
 * four different vertical adapter interfaces flow through this codebase;
 * each vertical's resource router gates calls behind `if (!adapter.listX)`
 * runtime checks rather than relying on type narrowing.
 */

// Force module-mode so `declare module 'fastify'` MERGES with the real
// fastify types instead of replacing the module declaration entirely.
export {}

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Resolved adapter (vertical-specific shape) set by the unified auth
     * middleware. Typed as `any` because four different vertical adapter
     * interfaces flow through this codebase and TypeScript can't pick the
     * right one from a static augmentation. Each router gates calls behind
     * `if (!adapter.listX)` runtime checks.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adapter: any
    /** Decrypted credentials for this connection. */
    credentials: {
      accessToken: string
      refreshToken?: string
      expiresAt?: Date
      scope?: string
      tenantId?: string
      [key: string]: unknown
    }
    /** Connection UUID. */
    connectionId: string
    /** Vertical the connection belongs to. */
    vertical: string
    /** Adapter slug. */
    platform: string
    /**
     * Tenant resolved from the request's Host header via the custom-domain map
     * (`TenantDomainFetcher`). `'default'` when the host is unknown or no custom
     * domains are configured. Distinct from the tenant carried by an API key
     * (which the auth middleware resolves separately); the two are cross-checked.
     */
    hostTenantId: string
  }
}
