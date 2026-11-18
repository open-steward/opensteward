import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

export interface Project44CapacityProviderIdentifier {
  type: string
  value: string
  [key: string]: unknown
}

export interface Project44SupportedService {
  serviceCode?: string
  name?: string
  [key: string]: unknown
}

export interface Project44CapacityProvider {
  capacityProviderIdentifiers?: Project44CapacityProviderIdentifier[]
  name?: string
  supportedServices?: Project44SupportedService[]
  type?: string
  [key: string]: unknown
}

export interface Project44CapacityProvidersResponse {
  capacityProviders?: Project44CapacityProvider[]
  [key: string]: unknown
}

function extractCode(raw: Project44CapacityProvider): string | undefined {
  const identifiers = raw.capacityProviderIdentifiers ?? []
  const scac = identifiers.find((i) => i.type === 'SCAC')
  if (scac) return scac.value
  const p44Global = identifiers.find((i) => i.type === 'P44_GLOBAL')
  if (p44Global) return p44Global.value
  return identifiers[0]?.value ?? undefined
}

export function transformCarrier(raw: Project44CapacityProvider): Carrier {
  const code = extractCode(raw)

  const services: CarrierService[] = (raw.supportedServices ?? [])
    .filter((svc) => !!svc.serviceCode)
    .map((svc) => ({
      code: svc.serviceCode!,
      name: svc.name ?? undefined,
    }))

  return {
    id: code ?? raw.name ?? 'unknown',
    name: raw.name ?? undefined,
    code: code ?? undefined,
    services: services.length > 0 ? services : undefined,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
