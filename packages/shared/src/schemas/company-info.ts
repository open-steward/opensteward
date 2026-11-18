/**
 * Company info — operator-level branding and developer-portal helper data.
 *
 * One record per OpenSteward deployment, owned by the admin-api DB.
 * Used by the admin UI for navbar branding and as a copy-paste source
 * when registering OAuth apps on each adapter's developer portal.
 *
 * All fields except updated_at / updated_by are optional so the operator
 * can fill in the form incrementally.
 */
import { z } from 'zod'
import { isIso3166Alpha2 } from './iso'

const URL_OPTIONAL = z
  .string()
  .nullable()
  .optional()
  .refine(
    (v) => {
      if (v === null || v === undefined || v === '') return true
      try {
        new URL(v)
        return true
      } catch {
        return false
      }
    },
    { message: 'must be a valid URL' },
  )

const HEX_COLOR_OPTIONAL = z
  .string()
  .nullable()
  .optional()
  .refine((v) => v === null || v === undefined || v === '' || /^#[0-9a-f]{6}$/i.test(v), {
    message: 'must be a 6-digit hex color like #2D6ADB',
  })

const COUNTRY_OPTIONAL = z
  .string()
  .nullable()
  .optional()
  .refine((v) => v === null || v === undefined || v === '' || isIso3166Alpha2(v.toUpperCase()), {
    message:
      'must be an assigned ISO 3166-1 alpha-2 country code (e.g. US, GB) — not merely two letters',
  })

const EMAIL_OPTIONAL = z
  .string()
  .nullable()
  .optional()
  .refine((v) => v === null || v === undefined || v === '' || /.+@.+\..+/.test(v), {
    message: 'must be an email address',
  })

/** Approximate decoded byte size of a base64 data URL (payload after the comma). */
function dataUrlBytes(v: string): number {
  const comma = v.indexOf(',')
  const b64 = comma >= 0 ? v.slice(comma + 1) : v
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}

const MAX_LOGO_BYTES = 512 * 1024
const MAX_FAVICON_BYTES = 256 * 1024
const MAX_FONT_BYTES = 512 * 1024

// Logo: an image data URL (svg / png / jpeg …) capped in size. Like the
// favicon it rides the unauthenticated public branding endpoint and lives in
// the single-row company_info record, so the size guard limits abuse + bloat.
const LOGO_DATA_URL_OPTIONAL = z
  .string()
  .nullable()
  .optional()
  .refine(
    (v) => v === null || v === undefined || v === '' || /^data:image\/[a-z+.-]+;base64,/.test(v),
    { message: "must be a data URL like 'data:image/svg+xml;base64,...'" },
  )
  .refine((v) => !v || dataUrlBytes(v) <= MAX_LOGO_BYTES, {
    message: `logo must be ${MAX_LOGO_BYTES / 1024}KB or smaller`,
  })

// Favicon: an uploaded image data URL (png / svg / x-icon …) capped in size.
const FAVICON_DATA_URL_OPTIONAL = z
  .string()
  .nullable()
  .optional()
  .refine(
    (v) => v === null || v === undefined || v === '' || /^data:image\/[a-z+.-]+;base64,/.test(v),
    { message: "must be an image data URL like 'data:image/png;base64,...'" },
  )
  .refine((v) => !v || dataUrlBytes(v) <= MAX_FAVICON_BYTES, {
    message: `favicon must be ${MAX_FAVICON_BYTES / 1024}KB or smaller`,
  })

// Uploaded font file stored inline as a data URL. Accepts the common font
// mimetypes browsers emit plus the octet-stream fallback some OSes use for
// .ttf/.otf. Capped in size because it rides the unauthenticated public
// branding endpoint and lives in the single-row company_info record.
const FONT_DATA_URL_OPTIONAL = z
  .string()
  .nullable()
  .optional()
  .refine(
    (v) =>
      v === null ||
      v === undefined ||
      v === '' ||
      /^data:(font\/[a-z0-9.+-]+|application\/(font-[a-z0-9.+-]+|x-font-[a-z0-9.+-]+|octet-stream|vnd\.ms-fontobject));base64,/.test(
        v,
      ),
    { message: "must be a font data URL like 'data:font/woff2;base64,...'" },
  )
  .refine((v) => !v || dataUrlBytes(v) <= MAX_FONT_BYTES, {
    message: `font must be ${MAX_FONT_BYTES / 1024}KB or smaller`,
  })

// External font stylesheet URL (e.g. Google Fonts). https-only.
const FONT_URL_OPTIONAL = z
  .string()
  .nullable()
  .optional()
  .refine(
    (v) => {
      if (v === null || v === undefined || v === '') return true
      try {
        return new URL(v).protocol === 'https:'
      } catch {
        return false
      }
    },
    { message: 'must be an https URL' },
  )

// CSS font-family value. Restricted to a safe charset (letters, digits,
// spaces, commas, quotes, hyphens) so it can be injected into a `--font-sans`
// override and an `@font-face` family without escaping surprises.
const FONT_FAMILY_OPTIONAL = z
  .string()
  .nullable()
  .optional()
  .refine((v) => v === null || v === undefined || v === '' || /^[\w ,'"-]{1,120}$/.test(v), {
    message: 'must contain only letters, digits, spaces, commas, quotes and hyphens',
  })

export const CompanyInfoSchema = z.object({
  name: z.string().nullable().optional().meta({ example: 'Acme Industries' }),
  legalName: z.string().nullable().optional().meta({ example: 'Acme Industries, Inc.' }),
  description: z
    .string()
    .nullable()
    .optional()
    .meta({ example: 'Industrial supplies and equipment.' }),
  website: URL_OPTIONAL.meta({ example: 'https://acme.example' }),
  logoDataUrl: LOGO_DATA_URL_OPTIONAL.meta({
    example: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
  }),
  primaryColor: HEX_COLOR_OPTIONAL.meta({ example: '#1d4ed8' }),
  secondaryColor: HEX_COLOR_OPTIONAL.meta({ example: '#0f172a' }),
  fontFamily: FONT_FAMILY_OPTIONAL.meta({ example: 'Inter, sans-serif' }),
  fontDataUrl: FONT_DATA_URL_OPTIONAL.meta({ example: 'data:font/woff2;base64,d09GMgABAAAAAA==' }),
  fontUrl: FONT_URL_OPTIONAL.meta({ example: 'https://fonts.acme.example/inter.css' }),
  faviconDataUrl: FAVICON_DATA_URL_OPTIONAL.meta({ example: 'data:image/png;base64,iVBORw0KGgo=' }),
  /**
   * White-label toggle. When true, surfaces that would otherwise fall back to
   * the default "OpenSteward" wordmark / mark (because the operator hasn't set
   * a logo or name) render nothing or a neutral label instead. An explicitly
   * set logo / name always renders regardless of this flag.
   */
  hideAttribution: z.boolean().nullable().optional().meta({ example: false }),
  supportEmail: EMAIL_OPTIONAL.meta({ example: 'jane.doe@acme.example' }),
  privacyPolicyUrl: URL_OPTIONAL.meta({ example: 'https://acme.example/privacy' }),
  termsOfServiceUrl: URL_OPTIONAL.meta({ example: 'https://acme.example/terms' }),
  addressLine1: z.string().nullable().optional().meta({ example: '2500 Market Street' }),
  addressLine2: z.string().nullable().optional().meta({ example: 'Suite 300' }),
  city: z.string().nullable().optional().meta({ example: 'San Francisco' }),
  region: z.string().nullable().optional().meta({ example: 'CA' }),
  postalCode: z.string().nullable().optional().meta({ example: '94114' }),
  country: COUNTRY_OPTIONAL.meta({ example: 'US' }),
  baseUrl: URL_OPTIONAL.meta({ example: 'https://acme.example' }),
})

export type CompanyInfo = z.infer<typeof CompanyInfoSchema>

/** Full record returned from the store, including audit columns. */
export interface CompanyInfoRecord extends CompanyInfo {
  updatedAt: number
  updatedBy: string
}
