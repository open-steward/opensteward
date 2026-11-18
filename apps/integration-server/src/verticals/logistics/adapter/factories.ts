/**
 * Adapter factories — lazy constructors keyed by platform slug.
 * Used for config-driven registration: only enabled adapters are loaded.
 */
import type { LogisticsAdapter } from './interface'

import { EasyPostAdapter } from '../adapters/easypost'
import { ShippoAdapter } from '../adapters/shippo'
import { ShipStationAdapter } from '../adapters/shipstation'
import { USPSAdapter } from '../adapters/usps'
import { AfterShipAdapter } from '../adapters/aftership'
import { SendleAdapter } from '../adapters/sendle'
import { StampsAdapter } from '../adapters/stamps'
import { FedExAdapter } from '../adapters/fedex'
import { UPSAdapter } from '../adapters/ups'
import { DHLAdapter } from '../adapters/dhl'
import { ShipBobAdapter } from '../adapters/shipbob'
import { PostNLAdapter } from '../adapters/postnl'
import { BringAdapter } from '../adapters/bring'
import { EvriAdapter } from '../adapters/evri'
import { JapanPostAdapter } from '../adapters/japan-post'
import { CorreiosAdapter } from '../adapters/correios'
import { SFExpressAdapter } from '../adapters/sf-express'
import { GlsAdapter } from '../adapters/gls'
import { AramexAdapter } from '../adapters/aramex'
import { TntAdapter } from '../adapters/tnt'
import { EstesAdapter } from '../adapters/estes'
import { RoyalMailAdapter } from '../adapters/royalmail'
import { DeutschePostAdapter } from '../adapters/deutschepost'
import { AusPostAdapter } from '../adapters/auspost'
import { PitneyBowesAdapter } from '../adapters/pitney-bowes'
import { OldDominionAdapter } from '../adapters/old-dominion'
import { XpoAdapter } from '../adapters/xpo'
import { FlexportAdapter } from '../adapters/flexport'
import { Project44Adapter } from '../adapters/project44'
import { DPDAdapter } from '../adapters/dpd'
import { ShiprocketAdapter } from '../adapters/shiprocket'
import { ParcelforceAdapter } from '../adapters/parcelforce'
import { ColissimoAdapter } from '../adapters/colissimo'
import { OnTracAdapter } from '../adapters/ontrac'
import { SaiaAdapter } from '../adapters/saia'
import { YamatoAdapter } from '../adapters/yamato'
import { LalamoveAdapter } from '../adapters/lalamove'
import { BlueDartAdapter } from '../adapters/bluedart'
import { DelhiveryAdapter } from '../adapters/delhivery'
import { EstafetaAdapter } from '../adapters/estafeta'
import { AndreaniAdapter } from '../adapters/andreani'
import { ChronopostAdapter } from '../adapters/chronopost'
import { SmsaAdapter } from '../adapters/smsa'
import { NaqelAdapter } from '../adapters/naqel'
import { FourKitesAdapter } from '../adapters/fourkites'
import { BpostAdapter } from '../adapters/bpost'
import { CorreosAdapter } from '../adapters/correos'
import { InPostAdapter } from '../adapters/inpost'
import { NZPostAdapter } from '../adapters/nzpost'
import { NinjaVanAdapter } from '../adapters/ninja-van'
import { ConvoyAdapter } from '../adapters/convoy'
import { YodelAdapter } from '../adapters/yodel'
import { MondialRelayAdapter } from '../adapters/mondialrelay'
import { PostiAdapter } from '../adapters/posti'
import { OmnivaAdapter } from '../adapters/omniva'
import { CttAdapter } from '../adapters/ctt'
import { BrtAdapter } from '../adapters/brt'
import { PosteItalianeAdapter } from '../adapters/poste-italiane'
import { PostDkAdapter } from '../adapters/post-dk'
import { SagawaAdapter } from '../adapters/sagawa'
import { JtExpressAdapter } from '../adapters/jt-express'
import { CjLogisticsAdapter } from '../adapters/cjlogistics'
import { EkartAdapter } from '../adapters/ekart'
import { KerryExpressAdapter } from '../adapters/kerry-express'
import { CorreoArgentinoAdapter } from '../adapters/correo-argentino'
import { ServientregaAdapter } from '../adapters/servientrega'
import { OcaAdapter } from '../adapters/oca'
import { AramexMeAdapter } from '../adapters/aramex-me'
import { FetchrAdapter } from '../adapters/fetchr'
import { UberFreightAdapter } from '../adapters/uber-freight'
import { LoadsmartAdapter } from '../adapters/loadsmart'
import { LaserShipAdapter } from '../adapters/lasership'
import { SpeeDeeAdapter } from '../adapters/spee-dee'
import { AverittAdapter } from '../adapters/averitt'
import { ForwardAirAdapter } from '../adapters/forward-air'
import { PittOhioAdapter } from '../adapters/pitt-ohio'
import { DpdDeAdapter } from '../adapters/dpd-de'
import { DpdUkAdapter } from '../adapters/dpd-uk'
import { GlsDeAdapter } from '../adapters/gls-de'
import { SingaporePostAdapter } from '../adapters/singapore-post'
import { HongkongPostAdapter } from '../adapters/hongkong-post'
import { FlashExpressAdapter } from '../adapters/flash-express'
import { JanioAdapter } from '../adapters/janio'
import { EtsExpressAdapter } from '../adapters/ets-express'
import { YtoExpressAdapter } from '../adapters/yto-express'
import { StoExpressAdapter } from '../adapters/sto-express'
import { ZtoExpressAdapter } from '../adapters/zto-express'
import { StarkenAdapter } from '../adapters/starken'
import { SkynetAdapter } from '../adapters/skynet'
import { DhlAfricaAdapter } from '../adapters/dhl-africa'
import { CoyoteAdapter } from '../adapters/coyote'
import { PirateShipAdapter } from '../adapters/pirateship'
import { ParcelHubAdapter } from '../adapters/parcelhub'
import { ShipwireAdapter } from '../adapters/shipwire'
import { FreightosAdapter } from '../adapters/freightos'
import { ShipTimeAdapter } from '../adapters/shiptime'
import { RplusLAdapter } from '../adapters/rplust'
import { EndiciaAdapter } from '../adapters/endicia'
import { GlobegisticsAdapter } from '../adapters/globegistics'
import { AsendiaAdapter } from '../adapters/asendia'
import { FastwayAfricaAdapter } from '../adapters/fastway-africa'
import { PostaKeAdapter } from '../adapters/posta-ke'
import { LimeExpressAdapter } from '../adapters/limeexpress'
import { MacropointAdapter } from '../adapters/macropoint'
import { TrimbleTmsAdapter } from '../adapters/trimble-tms'
import { MercuryGateAdapter } from '../adapters/mercurygate'
import { TransplaceAdapter } from '../adapters/transplace'
import { EchoAdapter } from '../adapters/echo'
import { SapTmAdapter } from '../adapters/sap-tm'
import { OracleOtmAdapter } from '../adapters/oracle-otm'
import { JdaAdapter } from '../adapters/jda'
import { ManhattanWmsAdapter } from '../adapters/manhattan-wms'
import { InforWmsAdapter } from '../adapters/infor-wms'
import { BluejayAdapter } from '../adapters/bluejay'
import { PostNordAdapter } from '../adapters/postnord'
import { CanadaPostAdapter } from '../adapters/canada-post'
import { PurolatorAdapter } from '../adapters/purolator'
import { CanparAdapter } from '../adapters/canpar'
import { NationexAdapter } from '../adapters/nationex'
import { DhlEcommerceAdapter } from '../adapters/dhl-ecommerce'
import { DhlParcelDeAdapter } from '../adapters/dhl-parcel-de'
import { DhlParcelBnlAdapter } from '../adapters/dhl-parcel-bnl'
import { DhlGlobalForwardingAdapter } from '../adapters/dhl-global-forwarding'
import { DhlFreightAdapter } from '../adapters/dhl-freight'
import { AmazonShippingAdapter } from '../adapters/amazon-shipping'
import { AmazonSpApiAdapter } from '../adapters/amazon-sp-api'
import { AmazonMcfAdapter } from '../adapters/amazon-mcf'
import { ArcbestAdapter } from '../adapters/arcbest'
import { TforceFreightAdapter } from '../adapters/tforce-freight'
import { DaytonFreightAdapter } from '../adapters/dayton-freight'
import { SeflAdapter } from '../adapters/sefl'
import { MaerskAdapter } from '../adapters/maersk'
import { CmaCgmAdapter } from '../adapters/cma-cgm'
import { HapagLloydAdapter } from '../adapters/hapag-lloyd'
import { OneLineAdapter } from '../adapters/one-line'
import { ZimAdapter } from '../adapters/zim'
import { VizionAdapter } from '../adapters/vizion'
import { Terminal49Adapter } from '../adapters/terminal49'
import { TiveAdapter } from '../adapters/tive'
import { SearatesAdapter } from '../adapters/searates'
import { WebcargoAdapter } from '../adapters/webcargo'
import { UberDirectAdapter } from '../adapters/uber-direct'
import { DoordashDriveAdapter } from '../adapters/doordash-drive'
import { RoadieAdapter } from '../adapters/roadie'
import { StuartAdapter } from '../adapters/stuart'
import { GophrAdapter } from '../adapters/gophr'
import { GophrUkAdapter } from '../adapters/gophr-uk'
import { NashAdapter } from '../adapters/nash'
import { VehoAdapter } from '../adapters/veho'
import { OnfleetAdapter } from '../adapters/onfleet'
import { BringgAdapter } from '../adapters/bringg'
import { TookanAdapter } from '../adapters/tookan'
import { RoutificAdapter } from '../adapters/routific'
import { CircuitAdapter } from '../adapters/circuit'
import { OptimorouteAdapter } from '../adapters/optimoroute'
import { SendcloudAdapter } from '../adapters/sendcloud'
import { MetapackAdapter } from '../adapters/metapack'
import { EasyshipAdapter } from '../adapters/easyship'
import { PacklinkProAdapter } from '../adapters/packlink-pro'
import { ShipmondoAdapter } from '../adapters/shipmondo'
import { HermesDeAdapter } from '../adapters/hermes-de'
import { GeodisAdapter } from '../adapters/geodis'
import { DpdLocalUkAdapter } from '../adapters/dpd-local-uk'
import { ApcOvernightAdapter } from '../adapters/apc-overnight'
import { WardTruckingAdapter } from '../adapters/ward-trucking'
import { StartrackAdapter } from '../adapters/startrack'
import { CouriersPleaseAdapter } from '../adapters/couriers-please'
import { TollGroupAdapter } from '../adapters/toll-group'
import { AramexAuAdapter } from '../adapters/aramex-au'
import { GdExpressAdapter } from '../adapters/gd-express'
import { DtdcAdapter } from '../adapters/dtdc'
import { XpressbeesAdapter } from '../adapters/xpressbees'
import { NimbusPostAdapter } from '../adapters/nimbuspost'
import { IthinkLogisticsAdapter } from '../adapters/ithink-logistics'
import { ShipwayAdapter } from '../adapters/shipway'
import { LeopardsAdapter } from '../adapters/leopards'
import { TcsPkAdapter } from '../adapters/tcs-pk'
import { GhnAdapter } from '../adapters/ghn'
import { GhtkAdapter } from '../adapters/ghtk'
import { JneAdapter } from '../adapters/jne'
import { SicepatAdapter } from '../adapters/sicepat'
import { GrabExpressAdapter } from '../adapters/grab-express'
import { GojekSendAdapter } from '../adapters/gojek-send'
import { FourPxAdapter } from '../adapters/fourpx'
import { CainiaoAdapter } from '../adapters/cainiao'
import { KoreaPostAdapter } from '../adapters/korea-post'
import { BostaAdapter } from '../adapters/bosta'
import { AymakanAdapter } from '../adapters/aymakan'
import { ExtensivAdapter } from '../adapters/extensiv'
import { LogiwaAdapter } from '../adapters/logiwa'
import { ShipheroAdapter } from '../adapters/shiphero'
import { ShipmonkAdapter } from '../adapters/shipmonk'
import { ShipperhqAdapter } from '../adapters/shipperhq'
import { NarvarAdapter } from '../adapters/narvar'
import { FlowspaceAdapter } from '../adapters/flowspace'
import { QuadientAdapter } from '../adapters/quadient'
import { IntelipostAdapter } from '../adapters/intelipost'
import { _123LoadboardAdapter } from '../adapters/123loadboard'
import { Track17Adapter } from '../adapters/17track'
import { AzulCargoAdapter } from '../adapters/azul-cargo'
import { BlueYonderAdapter } from '../adapters/blue-yonder'
import { BorzoAdapter } from '../adapters/borzo'
import { BoxberryAdapter } from '../adapters/boxberry'
import { CargoOneAdapter } from '../adapters/cargo-one'
import { CargowiseAdapter } from '../adapters/cargowise'
import { CargusAdapter } from '../adapters/cargus'
import { CdekAdapter } from '../adapters/cdek'
import { CentralTransportAdapter } from '../adapters/central-transport'
import { CHRobinsonAdapter } from '../adapters/ch-robinson'
import { ChazkiAdapter } from '../adapters/chazki'
import { CigoTrackerAdapter } from '../adapters/cigo-tracker'
import { ClickPostAdapter } from '../adapters/clickpost'
import { CubboAdapter } from '../adapters/cubbo'
import { CurriAdapter } from '../adapters/curri'
import { DaVinciUnifiedAdapter } from '../adapters/da-vinci-unified'
import { DatAdapter } from '../adapters/dat'
import { DeliverectAdapter } from '../adapters/deliverect'
import { DelivereeAdapter } from '../adapters/deliveree'
import { DeliverooAdapter } from '../adapters/deliveroo'
import { DeposcoAdapter } from '../adapters/deposco'
import { DescartesAdapter } from '../adapters/descartes'
import { DispatchTrackAdapter } from '../adapters/dispatchtrack'
import { DropoffAdapter } from '../adapters/dropoff'
import { E2openAdapter } from '../adapters/e2open'
import { ElogiiAdapter } from '../adapters/elogii'
import { EnviaAdapter } from '../adapters/envia'
import { EnviaYaAdapter } from '../adapters/enviaya'
import { EshipzAdapter } from '../adapters/eshipz'
import { FareyeAdapter } from '../adapters/fareye'
import { FreightifyAdapter } from '../adapters/freightify'
import { FrenetAdapter } from '../adapters/frenet'
import { GigLogisticsAdapter } from '../adapters/gig-logistics'
import { GlovoAdapter } from '../adapters/glovo'
import { GoCometAdapter } from '../adapters/gocomet'
import { GoFreightAdapter } from '../adapters/gofreight'
import { GoshareAdapter } from '../adapters/goshare'
import { IMileAdapter } from '../adapters/imile'
import { InfoplusAdapter } from '../adapters/infoplus'
import { InnoshipAdapter } from '../adapters/innoship'
import { JadlogAdapter } from '../adapters/jadlog'
import { JeeblyAdapter } from '../adapters/jeebly'
import { KarrioAdapter } from '../adapters/karrio'
import { KitchenHubAdapter } from '../adapters/kitchenhub'
import { Kobo360Adapter } from '../adapters/kobo360'
import { Locate2uAdapter } from '../adapters/locate2u'
import { LocusAdapter } from '../adapters/locus'
import { LoggiAdapter } from '../adapters/loggi'
import { LoginextAdapter } from '../adapters/loginext'
import { LoopReturnsAdapter } from '../adapters/loop-returns'
import { MagayaAdapter } from '../adapters/magaya'
import { MelhorEnvioAdapter } from '../adapters/melhor-envio'
import { MothershipAdapter } from '../adapters/mothership'
import { MylerzAdapter } from '../adapters/mylerz'
import { NetworkONAdapter } from '../adapters/networkon'
import { NeuroredAdapter } from '../adapters/neurored'
import { NextBillionAiAdapter } from '../adapters/nextbillion-ai'
import { NovaPoshtaAdapter } from '../adapters/nova-poshta'
import { NShiftAdapter } from '../adapters/nshift'
import { OnroAdapter } from '../adapters/onro'
import { OutvioAdapter } from '../adapters/outvio'
import { PacketaAdapter } from '../adapters/packeta'
import { PandagoAdapter } from '../adapters/pandago'
import { Parcel2GoAdapter } from '../adapters/parcel2go'
import { ParcellabAdapter } from '../adapters/parcellab'
import { PickrrAdapter } from '../adapters/pickrr'
import { PochtaRussiaAdapter } from '../adapters/pochta-russia'
import { PortcastAdapter } from '../adapters/portcast'
import { PplCzAdapter } from '../adapters/ppl-cz'
import { QuiqupAdapter } from '../adapters/quiqup'
import { ReturnGoAdapter } from '../adapters/returngo'
import { RlCarriersAdapter } from '../adapters/rl-carriers'
import { RoambeeAdapter } from '../adapters/roambee'
import { Route4MeAdapter } from '../adapters/route4me'
import { SamedayAdapter } from '../adapters/sameday'
import { SamsaraAdapter } from '../adapters/samsara'
import { SeaVantageAdapter } from '../adapters/seavantage'
import { SendParcelAdapter } from '../adapters/sendparcel'
import { SenpexAdapter } from '../adapters/senpex'
import { Ship24Adapter } from '../adapters/ship24'
import { ShipbubbleAdapter } from '../adapters/shipbubble'
import { ShipcloudAdapter } from '../adapters/shipcloud'
import { ShipdayAdapter } from '../adapters/shipday'
import { ShipEngineAdapter } from '../adapters/shipengine'
import { ShipiumAdapter } from '../adapters/shipium'
import { ShipKaroAdapter } from '../adapters/shipkaro'
import { ShipMozoAdapter } from '../adapters/shipmozo'
import { ShippeoAdapter } from '../adapters/shippeo'
import { ShippifyAdapter } from '../adapters/shippify'
import { ShippyProAdapter } from '../adapters/shippypro'
import { ShipsGoAdapter } from '../adapters/shipsgo'
import { ShipsyAdapter } from '../adapters/shipsy'
import { ShiptheoryAdapter } from '../adapters/shiptheory'
import { ShypliteAdapter } from '../adapters/shyplite'
import { SinayAdapter } from '../adapters/sinay'
import { SkydropxAdapter } from '../adapters/skydropx'
import { Smc3Adapter } from '../adapters/smc3'
import { SoutheasternFreightAdapter } from '../adapters/southeastern-freight'
import { StarshipitAdapter } from '../adapters/starshipit'
import { TcsExpressAdapter } from '../adapters/tcs-express'
import { TerminalAfricaAdapter } from '../adapters/terminal-africa'
import { TopshipAdapter } from '../adapters/topship'
import { TotalExpressAdapter } from '../adapters/total-express'
import { TrackPodAdapter } from '../adapters/track-pod'
import { TrackingMoreAdapter } from '../adapters/trackingmore'
import { TradlinxAdapter } from '../adapters/tradlinx'
import { TransporeonAdapter } from '../adapters/transporeon'
import { TransportifyAdapter } from '../adapters/transportify'
import { TrimbleTruckmateAdapter } from '../adapters/trimble-truckmate'
import { TruckstopAdapter } from '../adapters/truckstop'
import { TurvoAdapter } from '../adapters/turvo'
import { UnifiedToShippingAdapter } from '../adapters/unified-to-shipping'
import { VamashipAdapter } from '../adapters/vamaship'
import { VenipakAdapter } from '../adapters/venipak'
import { VeraCoreAdapter } from '../adapters/veracore'
import { VizionApiAdapter } from '../adapters/vizion-api'
import { WakeoAdapter } from '../adapters/wakeo'
import { WarpAdapter } from '../adapters/warp'
import { WebshipperAdapter } from '../adapters/webshipper'
import { WiseSystemsAdapter } from '../adapters/wise-systems'
import { WondermentAdapter } from '../adapters/wonderment'

import type { AdapterFactory } from '@opensteward/shared'

/**
 * Narrow the factory boilerplate. Each platform adapter has a slightly
 * different constructor signature (some take `{clientId, clientSecret, ...}`,
 * some take an API key, some take nothing), and the registry-level factory
 * hands them a generic `Record<string, unknown>`. This helper absorbs the
 * type mismatch in a single location so call sites stay tidy.
 */
function factory<T extends LogisticsAdapter>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Ctor: new (...args: any[]) => T,
): AdapterFactory<T> {
  return (cfg) => new Ctor(cfg)
}

export const ADAPTER_FACTORIES: Record<string, AdapterFactory<LogisticsAdapter>> = {
  'easypost': factory(EasyPostAdapter),
  'shippo': factory(ShippoAdapter),
  'shipstation': factory(ShipStationAdapter),
  'usps': factory(USPSAdapter),
  'aftership': factory(AfterShipAdapter),
  'sendle': factory(SendleAdapter),
  'stamps': factory(StampsAdapter),
  'fedex': factory(FedExAdapter),
  'ups': factory(UPSAdapter),
  'dhl': factory(DHLAdapter),
  'shipbob': factory(ShipBobAdapter),
  'postnl': factory(PostNLAdapter),
  'bring': factory(BringAdapter),
  'evri': factory(EvriAdapter),
  'japan-post': factory(JapanPostAdapter),
  'correios': factory(CorreiosAdapter),
  'sf-express': factory(SFExpressAdapter),
  'gls': factory(GlsAdapter),
  'aramex': factory(AramexAdapter),
  'tnt': factory(TntAdapter),
  'estes': factory(EstesAdapter),
  'royalmail': factory(RoyalMailAdapter),
  'deutschepost': factory(DeutschePostAdapter),
  'auspost': factory(AusPostAdapter),
  'pitney-bowes': factory(PitneyBowesAdapter),
  'old-dominion': factory(OldDominionAdapter),
  'xpo': factory(XpoAdapter),
  'flexport': factory(FlexportAdapter),
  'project44': factory(Project44Adapter),
  'dpd': factory(DPDAdapter),
  'shiprocket': factory(ShiprocketAdapter),
  'parcelforce': factory(ParcelforceAdapter),
  'colissimo': factory(ColissimoAdapter),
  'ontrac': factory(OnTracAdapter),
  'saia': factory(SaiaAdapter),
  'yamato': factory(YamatoAdapter),
  'lalamove': factory(LalamoveAdapter),
  'bluedart': factory(BlueDartAdapter),
  'delhivery': factory(DelhiveryAdapter),
  'estafeta': factory(EstafetaAdapter),
  'andreani': factory(AndreaniAdapter),
  'chronopost': factory(ChronopostAdapter),
  'smsa': factory(SmsaAdapter),
  'naqel': factory(NaqelAdapter),
  'fourkites': factory(FourKitesAdapter),
  'bpost': factory(BpostAdapter),
  'correos': factory(CorreosAdapter),
  'inpost': factory(InPostAdapter),
  'nzpost': factory(NZPostAdapter),
  'ninja-van': factory(NinjaVanAdapter),
  'convoy': factory(ConvoyAdapter),
  'yodel': factory(YodelAdapter),
  'mondialrelay': factory(MondialRelayAdapter),
  'posti': factory(PostiAdapter),
  'omniva': factory(OmnivaAdapter),
  'ctt': factory(CttAdapter),
  'brt': factory(BrtAdapter),
  'poste-italiane': factory(PosteItalianeAdapter),
  'post-dk': factory(PostDkAdapter),
  'sagawa': factory(SagawaAdapter),
  'jt-express': factory(JtExpressAdapter),
  'cjlogistics': factory(CjLogisticsAdapter),
  'ekart': factory(EkartAdapter),
  'kerry-express': factory(KerryExpressAdapter),
  'correo-argentino': factory(CorreoArgentinoAdapter),
  'servientrega': factory(ServientregaAdapter),
  'oca': factory(OcaAdapter),
  'aramex-me': factory(AramexMeAdapter),
  'fetchr': factory(FetchrAdapter),
  'uber-freight': factory(UberFreightAdapter),
  'loadsmart': factory(LoadsmartAdapter),
  'lasership': factory(LaserShipAdapter),
  'spee-dee': factory(SpeeDeeAdapter),
  'averitt': factory(AverittAdapter),
  'forward-air': factory(ForwardAirAdapter),
  'pitt-ohio': factory(PittOhioAdapter),
  'dpd-de': factory(DpdDeAdapter),
  'dpd-uk': factory(DpdUkAdapter),
  'gls-de': factory(GlsDeAdapter),
  'singapore-post': factory(SingaporePostAdapter),
  'hongkong-post': factory(HongkongPostAdapter),
  'flash-express': factory(FlashExpressAdapter),
  'janio': factory(JanioAdapter),
  'ets-express': factory(EtsExpressAdapter),
  'yto-express': factory(YtoExpressAdapter),
  'sto-express': factory(StoExpressAdapter),
  'zto-express': factory(ZtoExpressAdapter),
  'starken': factory(StarkenAdapter),
  'skynet': factory(SkynetAdapter),
  'dhl-africa': factory(DhlAfricaAdapter),
  'coyote': factory(CoyoteAdapter),
  'pirateship': factory(PirateShipAdapter),
  'parcelhub': factory(ParcelHubAdapter),
  'shipwire': factory(ShipwireAdapter),
  'freightos': factory(FreightosAdapter),
  'shiptime': factory(ShipTimeAdapter),
  'rplust': factory(RplusLAdapter),
  'endicia': factory(EndiciaAdapter),
  'globegistics': factory(GlobegisticsAdapter),
  'asendia': factory(AsendiaAdapter),
  'fastway-africa': factory(FastwayAfricaAdapter),
  'posta-ke': factory(PostaKeAdapter),
  'limeexpress': factory(LimeExpressAdapter),
  'macropoint': factory(MacropointAdapter),
  'trimble-tms': factory(TrimbleTmsAdapter),
  'mercurygate': factory(MercuryGateAdapter),
  'transplace': factory(TransplaceAdapter),
  'echo': factory(EchoAdapter),
  'sap-tm': factory(SapTmAdapter),
  'oracle-otm': factory(OracleOtmAdapter),
  'jda': factory(JdaAdapter),
  'manhattan-wms': factory(ManhattanWmsAdapter),
  'infor-wms': factory(InforWmsAdapter),
  'bluejay': factory(BluejayAdapter),
  'postnord': factory(PostNordAdapter),
  'canada-post': factory(CanadaPostAdapter),
  'purolator': factory(PurolatorAdapter),
  'canpar': factory(CanparAdapter),
  'nationex': factory(NationexAdapter),
  'dhl-ecommerce': factory(DhlEcommerceAdapter),
  'dhl-parcel-de': factory(DhlParcelDeAdapter),
  'dhl-parcel-bnl': factory(DhlParcelBnlAdapter),
  'dhl-global-forwarding': factory(DhlGlobalForwardingAdapter),
  'dhl-freight': factory(DhlFreightAdapter),
  'amazon-shipping': factory(AmazonShippingAdapter),
  'amazon-sp-api': factory(AmazonSpApiAdapter),
  'amazon-mcf': factory(AmazonMcfAdapter),
  'arcbest': factory(ArcbestAdapter),
  'tforce-freight': factory(TforceFreightAdapter),
  'dayton-freight': factory(DaytonFreightAdapter),
  'sefl': factory(SeflAdapter),
  'maersk': factory(MaerskAdapter),
  'cma-cgm': factory(CmaCgmAdapter),
  'hapag-lloyd': factory(HapagLloydAdapter),
  'one-line': factory(OneLineAdapter),
  'zim': factory(ZimAdapter),
  'vizion': factory(VizionAdapter),
  'terminal49': factory(Terminal49Adapter),
  'tive': factory(TiveAdapter),
  'searates': factory(SearatesAdapter),
  'webcargo': factory(WebcargoAdapter),
  'uber-direct': factory(UberDirectAdapter),
  'doordash-drive': factory(DoordashDriveAdapter),
  'roadie': factory(RoadieAdapter),
  'stuart': factory(StuartAdapter),
  'gophr': factory(GophrAdapter),
  'gophr-uk': factory(GophrUkAdapter),
  'nash': factory(NashAdapter),
  'veho': factory(VehoAdapter),
  'onfleet': factory(OnfleetAdapter),
  'bringg': factory(BringgAdapter),
  'tookan': factory(TookanAdapter),
  'routific': factory(RoutificAdapter),
  'circuit': factory(CircuitAdapter),
  'optimoroute': factory(OptimorouteAdapter),
  'sendcloud': factory(SendcloudAdapter),
  'metapack': factory(MetapackAdapter),
  'easyship': factory(EasyshipAdapter),
  'packlink-pro': factory(PacklinkProAdapter),
  'shipmondo': factory(ShipmondoAdapter),
  'hermes-de': factory(HermesDeAdapter),
  'geodis': factory(GeodisAdapter),
  'dpd-local-uk': factory(DpdLocalUkAdapter),
  'apc-overnight': factory(ApcOvernightAdapter),
  'ward-trucking': factory(WardTruckingAdapter),
  'startrack': factory(StartrackAdapter),
  'couriers-please': factory(CouriersPleaseAdapter),
  'toll-group': factory(TollGroupAdapter),
  'aramex-au': factory(AramexAuAdapter),
  'gd-express': factory(GdExpressAdapter),
  'dtdc': factory(DtdcAdapter),
  'xpressbees': factory(XpressbeesAdapter),
  'nimbuspost': factory(NimbusPostAdapter),
  'ithink-logistics': factory(IthinkLogisticsAdapter),
  'shipway': factory(ShipwayAdapter),
  'leopards': factory(LeopardsAdapter),
  'tcs-pk': factory(TcsPkAdapter),
  'ghn': factory(GhnAdapter),
  'ghtk': factory(GhtkAdapter),
  'jne': factory(JneAdapter),
  'sicepat': factory(SicepatAdapter),
  'grab-express': factory(GrabExpressAdapter),
  'gojek-send': factory(GojekSendAdapter),
  'fourpx': factory(FourPxAdapter),
  'cainiao': factory(CainiaoAdapter),
  'korea-post': factory(KoreaPostAdapter),
  'bosta': factory(BostaAdapter),
  'aymakan': factory(AymakanAdapter),
  'extensiv': factory(ExtensivAdapter),
  'logiwa': factory(LogiwaAdapter),
  'shiphero': factory(ShipheroAdapter),
  'shipmonk': factory(ShipmonkAdapter),
  'shipperhq': factory(ShipperhqAdapter),
  'narvar': factory(NarvarAdapter),
  'flowspace': factory(FlowspaceAdapter),
  'quadient': factory(QuadientAdapter),
  'intelipost': factory(IntelipostAdapter),
  '123loadboard': factory(_123LoadboardAdapter),
  '17track': factory(Track17Adapter),
  'azul-cargo': factory(AzulCargoAdapter),
  'blue-yonder': factory(BlueYonderAdapter),
  borzo: factory(BorzoAdapter),
  boxberry: factory(BoxberryAdapter),
  'cargo-one': factory(CargoOneAdapter),
  cargowise: factory(CargowiseAdapter),
  cargus: factory(CargusAdapter),
  cdek: factory(CdekAdapter),
  'central-transport': factory(CentralTransportAdapter),
  'ch-robinson': factory(CHRobinsonAdapter),
  chazki: factory(ChazkiAdapter),
  'cigo-tracker': factory(CigoTrackerAdapter),
  clickpost: factory(ClickPostAdapter),
  cubbo: factory(CubboAdapter),
  curri: factory(CurriAdapter),
  'da-vinci-unified': factory(DaVinciUnifiedAdapter),
  dat: factory(DatAdapter),
  deliverect: factory(DeliverectAdapter),
  deliveree: factory(DelivereeAdapter),
  deliveroo: factory(DeliverooAdapter),
  deposco: factory(DeposcoAdapter),
  descartes: factory(DescartesAdapter),
  dispatchtrack: factory(DispatchTrackAdapter),
  dropoff: factory(DropoffAdapter),
  e2open: factory(E2openAdapter),
  elogii: factory(ElogiiAdapter),
  envia: factory(EnviaAdapter),
  enviaya: factory(EnviaYaAdapter),
  eshipz: factory(EshipzAdapter),
  fareye: factory(FareyeAdapter),
  freightify: factory(FreightifyAdapter),
  frenet: factory(FrenetAdapter),
  'gig-logistics': factory(GigLogisticsAdapter),
  glovo: factory(GlovoAdapter),
  gocomet: factory(GoCometAdapter),
  gofreight: factory(GoFreightAdapter),
  goshare: factory(GoshareAdapter),
  imile: factory(IMileAdapter),
  infoplus: factory(InfoplusAdapter),
  innoship: factory(InnoshipAdapter),
  jadlog: factory(JadlogAdapter),
  jeebly: factory(JeeblyAdapter),
  karrio: factory(KarrioAdapter),
  kitchenhub: factory(KitchenHubAdapter),
  kobo360: factory(Kobo360Adapter),
  locate2u: factory(Locate2uAdapter),
  locus: factory(LocusAdapter),
  loggi: factory(LoggiAdapter),
  loginext: factory(LoginextAdapter),
  'loop-returns': factory(LoopReturnsAdapter),
  magaya: factory(MagayaAdapter),
  'melhor-envio': factory(MelhorEnvioAdapter),
  mothership: factory(MothershipAdapter),
  mylerz: factory(MylerzAdapter),
  networkon: factory(NetworkONAdapter),
  neurored: factory(NeuroredAdapter),
  'nextbillion-ai': factory(NextBillionAiAdapter),
  'nova-poshta': factory(NovaPoshtaAdapter),
  nshift: factory(NShiftAdapter),
  onro: factory(OnroAdapter),
  outvio: factory(OutvioAdapter),
  packeta: factory(PacketaAdapter),
  pandago: factory(PandagoAdapter),
  parcel2go: factory(Parcel2GoAdapter),
  parcellab: factory(ParcellabAdapter),
  pickrr: factory(PickrrAdapter),
  'pochta-russia': factory(PochtaRussiaAdapter),
  portcast: factory(PortcastAdapter),
  'ppl-cz': factory(PplCzAdapter),
  quiqup: factory(QuiqupAdapter),
  returngo: factory(ReturnGoAdapter),
  'rl-carriers': factory(RlCarriersAdapter),
  roambee: factory(RoambeeAdapter),
  route4me: factory(Route4MeAdapter),
  sameday: factory(SamedayAdapter),
  samsara: factory(SamsaraAdapter),
  seavantage: factory(SeaVantageAdapter),
  sendparcel: factory(SendParcelAdapter),
  senpex: factory(SenpexAdapter),
  ship24: factory(Ship24Adapter),
  shipbubble: factory(ShipbubbleAdapter),
  shipcloud: factory(ShipcloudAdapter),
  shipday: factory(ShipdayAdapter),
  shipengine: factory(ShipEngineAdapter),
  shipium: factory(ShipiumAdapter),
  shipkaro: factory(ShipKaroAdapter),
  shipmozo: factory(ShipMozoAdapter),
  shippeo: factory(ShippeoAdapter),
  shippify: factory(ShippifyAdapter),
  shippypro: factory(ShippyProAdapter),
  shipsgo: factory(ShipsGoAdapter),
  shipsy: factory(ShipsyAdapter),
  shiptheory: factory(ShiptheoryAdapter),
  shyplite: factory(ShypliteAdapter),
  sinay: factory(SinayAdapter),
  skydropx: factory(SkydropxAdapter),
  smc3: factory(Smc3Adapter),
  'southeastern-freight': factory(SoutheasternFreightAdapter),
  starshipit: factory(StarshipitAdapter),
  'tcs-express': factory(TcsExpressAdapter),
  'terminal-africa': factory(TerminalAfricaAdapter),
  topship: factory(TopshipAdapter),
  'total-express': factory(TotalExpressAdapter),
  'track-pod': factory(TrackPodAdapter),
  trackingmore: factory(TrackingMoreAdapter),
  tradlinx: factory(TradlinxAdapter),
  transporeon: factory(TransporeonAdapter),
  transportify: factory(TransportifyAdapter),
  'trimble-truckmate': factory(TrimbleTruckmateAdapter),
  truckstop: factory(TruckstopAdapter),
  turvo: factory(TurvoAdapter),
  'unified-to-shipping': factory(UnifiedToShippingAdapter),
  vamaship: factory(VamashipAdapter),
  venipak: factory(VenipakAdapter),
  veracore: factory(VeraCoreAdapter),
  'vizion-api': factory(VizionApiAdapter),
  wakeo: factory(WakeoAdapter),
  warp: factory(WarpAdapter),
  webshipper: factory(WebshipperAdapter),
  'wise-systems': factory(WiseSystemsAdapter),
  wonderment: factory(WondermentAdapter),
}
