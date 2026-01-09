/**
 * Punto de exportacion del modulo identity.
 */

export { IdentityModule } from './identity.module';
export { IdentityHashService } from './identity-hash.service';
export { IdentityResolverService } from './identity-resolver.service';
export type {
  ResolvedIdentity,
  CreateMappingData,
} from './identity-resolver.service';
export { UserIdentityMap } from './user-identity-map.entity';
