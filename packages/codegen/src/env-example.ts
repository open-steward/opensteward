import { writeFileSync, readFileSync } from 'fs'
import type { PlatformLike, EnvExtras } from './types'

function authComment(authType: string): string {
  switch (authType) {
    case 'api_key':
      return '# API key — paste your key below'
    case 'basic':
      return '# Basic auth — provide username and password'
    case 'session':
      return '# Session auth — provide session credentials'
    case 'local':
      return '# Local/file-based — provide file path or import key'
    default:
      return '# OAuth2 — obtain from provider developer portal'
  }
}

function isOAuth(authType: string): boolean {
  return authType === 'oauth2' || authType === 'oauth2_cc'
}

/**
 * Generate a .env.example file from platform metadata and env extras.
 *
 * @param platforms - normalized platform metadata
 * @param envExtrasPath - path to env-extras.json
 * @param outputPath - where to write the .env.example file
 * @param header - optional header lines to prepend
 */
export function generateEnvExample(
  platforms: PlatformLike[],
  envExtrasPath: string,
  outputPath: string,
  header?: string[],
): void {
  const envExtras: EnvExtras = JSON.parse(readFileSync(envExtrasPath, 'utf8'))

  // Only include platforms that have env-extras entries (i.e. have adapters)
  const included = platforms
    .filter((p) => envExtras[p.slug])
    .sort((a, b) => a.slug.localeCompare(b.slug))

  const lines: string[] = [
    '# Auto-generated — do not edit by hand.',
    `# Source: platforms metadata + ${envExtrasPath}`,
    `# Re-generate: pnpm run generate:env-example`,
    '',
    ...(header ?? [
      '# ── Core ─────────────────────────────────────────────────',
      'STORE_SECRET=change-me-to-a-long-random-string-at-least-32-chars',
      '',
    ]),
  ]

  for (const meta of included) {
    const prefix = meta.slug.toUpperCase().replace(/-/g, '_')
    const extras = envExtras[meta.slug]
    const comment = authComment(meta.authType)

    lines.push(`# ── ${meta.name} (${meta.slug}) ──`)
    lines.push(comment)

    if (extras?.notes) {
      lines.push(`# Note: ${extras.notes}`)
    }

    if (extras?.base_url) {
      lines.push(`${prefix}_BASE_URL=${extras.base_url}`)
    }

    if (isOAuth(meta.authType)) {
      lines.push(`${prefix}_CLIENT_ID=`)
      lines.push(`${prefix}_CLIENT_SECRET=`)
    }

    lines.push('')
  }

  writeFileSync(outputPath, lines.join('\n'))
}
