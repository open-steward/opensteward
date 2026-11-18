import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type RampGLAccount,
} from '../../../../../../../src/verticals/accounting/adapters/ramp/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<RampGLAccount> = {}): RampGLAccount {
  return {
    id: 'gl_uuid_001',
    remote_id: 'erp_4000',
    code: '4000',
    name: 'Sales Revenue',
    is_active: true,
    is_synced: true,
    accounting_connection_id: 'conn_abc',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id', () => {
    expect(transformAccount(makeAccount()).id).toBe('gl_uuid_001')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales Revenue')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('4000')
  })

  it('maps is_active=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ is_active: true })).status).toBe('ACTIVE')
  })

  it('maps is_active=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ is_active: false })).status).toBe('ARCHIVED')
  })

  it('defaults to ACTIVE when is_active is undefined', () => {
    expect(transformAccount(makeAccount({ is_active: undefined })).status).toBe('ACTIVE')
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces output that passes AccountSchema validation', () => {
    expect(() => AccountSchema.parse(transformAccount(makeAccount()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformAccount({ id: 'gl_001' })
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
