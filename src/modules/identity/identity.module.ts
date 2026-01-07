import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityHashService } from './identity-hash.service';
import { IdentityResolverService } from './identity-resolver.service';
import { UserIdentityMap } from './user-identity-map.entity';

/**
 * Módulo de identidad para el desacoplamiento entre schemas auth y business.
 *
 * Este módulo proporciona:
 * - IdentityHashService: Generación de hashes determinísticos y encriptación
 * - IdentityResolverService: Resolución de identidades entre schemas
 * - UserIdentityMap: Entidad para almacenar mapeos encriptados
 *
 * @Global para que esté disponible en toda la aplicación sin importarlo explícitamente
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([UserIdentityMap])],
  providers: [IdentityHashService, IdentityResolverService],
  exports: [IdentityHashService, IdentityResolverService],
})
export class IdentityModule {}
