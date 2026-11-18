import { VismaAdapter, type VismaAdapterConfig } from '../visma'

export type SpirisAdapterConfig = VismaAdapterConfig

export class SpirisAdapter extends VismaAdapter {
  override readonly platform: string = 'spiris'

  constructor(config: SpirisAdapterConfig) {
    super(config)
  }
}
