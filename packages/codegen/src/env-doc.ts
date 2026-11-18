import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import type { PlatformLike } from './types'

function isOAuth(authType: string): boolean {
  return authType === 'oauth2' || authType === 'oauth2_cc'
}

/**
 * Generate an environment-variables.md documentation file.
 */
export function generateEnvDoc(platforms: PlatformLike[], outputPath: string): void {
  const sorted = [...platforms].sort((a, b) => a.slug.localeCompare(b.slug))
  const oauth = sorted.filter((p) => isOAuth(p.authType))
  const nonOAuth = sorted.filter((p) => !isOAuth(p.authType))

  const lines: string[] = [
    '# Environment Variables',
    '',
    '> Auto-generated — do not edit by hand.',
    '',
    '## Core',
    '',
    '| Variable | Required | Description |',
    '|----------|----------|-------------|',
    '| `STORE_SECRET` | Yes | Encryption secret for credential store (min 32 chars) |',
    '| `PORT` | No | Server port (default varies by app) |',
    '| `HOST` | No | Server bind address (default: `0.0.0.0`) |',
    '',
  ]

  if (oauth.length > 0) {
    lines.push('## OAuth2 Adapters', '')
    lines.push('| Platform | Client ID | Client Secret |')
    lines.push('|----------|-----------|---------------|')
    for (const p of oauth) {
      const prefix = p.slug.toUpperCase().replace(/-/g, '_')
      lines.push(`| ${p.name} | \`${prefix}_CLIENT_ID\` | \`${prefix}_CLIENT_SECRET\` |`)
    }
    lines.push('')
  }

  if (nonOAuth.length > 0) {
    lines.push('## Non-OAuth Adapters', '')
    lines.push('| Platform | Auth Type | Variables |')
    lines.push('|----------|-----------|-----------|')
    for (const p of nonOAuth) {
      const prefix = p.slug.toUpperCase().replace(/-/g, '_')
      lines.push(`| ${p.name} | ${p.authType} | \`${prefix}_BASE_URL\` |`)
    }
    lines.push('')
  }

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, lines.join('\n'))
}
