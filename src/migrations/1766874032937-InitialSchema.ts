import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1766874032937 implements MigrationInterface {
  name = 'InitialSchema1766874032937';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "business"."user_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "nombre" character varying(15) NOT NULL, "apellido" character varying(15) NOT NULL, "celular" character varying(10) NOT NULL, "fotoPerfilUrl" text, "ratingPromedio" numeric(3,2) NOT NULL DEFAULT '5', "totalViajes" integer NOT NULL DEFAULT '0', "totalCalificaciones" integer NOT NULL DEFAULT '0', "isBloqueadoPorRating" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_8481388d6325e752cd4d7e26c6d" UNIQUE ("userId"), CONSTRAINT "REL_8481388d6325e752cd4d7e26c6" UNIQUE ("userId"), CONSTRAINT "PK_1ec6662219f4605723f1e41b6cb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_profiles_is_bloqueado_por_rating" ON "business"."user_profiles" ("isBloqueadoPorRating") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_profiles_rating_promedio" ON "business"."user_profiles" ("ratingPromedio") `,
    );
    await queryRunner.query(
      `CREATE TABLE "business"."business_users" ("id" uuid NOT NULL, "email" character varying(30) NOT NULL, "alias" character varying(25) NOT NULL, "isDeleted" boolean NOT NULL DEFAULT false, "deletedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_b5dc4a60e0ba703952bc82513e0" UNIQUE ("email"), CONSTRAINT "UQ_cc9c0da4439790d3694573768cb" UNIQUE ("alias"), CONSTRAINT "PK_c60b727065c3c87bfb00cfcc8e7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_business_users_created_at" ON "business"."business_users" ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_business_users_is_deleted" ON "business"."business_users" ("isDeleted") `,
    );
    await queryRunner.query(
      `CREATE TYPE "business"."driver_documents_tipo_enum" AS ENUM('LICENCIA', 'MATRICULA')`,
    );
    await queryRunner.query(
      `CREATE TYPE "business"."driver_documents_estado_enum" AS ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "business"."driver_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "driverId" uuid NOT NULL, "tipo" "business"."driver_documents_tipo_enum" NOT NULL, "archivoUrl" text NOT NULL, "estado" "business"."driver_documents_estado_enum" NOT NULL DEFAULT 'PENDIENTE', "motivoRechazo" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_driver_documents_driver_tipo" UNIQUE ("driverId", "tipo"), CONSTRAINT "PK_31c28b4e8f55a5d411597d45ab2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_driver_documents_estado" ON "business"."driver_documents" ("estado") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_driver_documents_driver_id" ON "business"."driver_documents" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "business"."vehicles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "driverId" uuid NOT NULL, "marca" character varying(15) NOT NULL, "modelo" character varying(15) NOT NULL, "color" character varying(10) NOT NULL, "placa" character varying(7) NOT NULL, "asientosDisponibles" integer NOT NULL, "isActivo" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_00f176cfec58c116bac5a4a27ed" UNIQUE ("placa"), CONSTRAINT "PK_18d8646b59304dce4af3a9e35b6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_vehicles_is_activo" ON "business"."vehicles" ("isActivo") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_vehicles_driver_id" ON "business"."vehicles" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "business"."drivers_estado_enum" AS ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO', 'SUSPENDIDO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "business"."drivers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "paypalEmail" character varying(254) NOT NULL, "estado" "business"."drivers_estado_enum" NOT NULL DEFAULT 'PENDIENTE', "fechaSolicitud" TIMESTAMP NOT NULL DEFAULT now(), "fechaAprobacion" TIMESTAMP, "motivoRechazo" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_57d866371f392f459cd9ee46f6a" UNIQUE ("userId"), CONSTRAINT "REL_57d866371f392f459cd9ee46f6" UNIQUE ("userId"), CONSTRAINT "PK_92ab3fb69e566d3eb0cae896047" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_drivers_fecha_solicitud" ON "business"."drivers" ("fechaSolicitud") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_drivers_estado" ON "business"."drivers" ("estado") `,
    );
    await queryRunner.query(
      `CREATE TABLE "business"."route_stops" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "routeId" uuid NOT NULL, "lat" numeric(10,7) NOT NULL, "lng" numeric(10,7) NOT NULL, "direccion" text NOT NULL, "orden" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_route_stops_route_orden" UNIQUE ("routeId", "orden"), CONSTRAINT "PK_22c09afc24c0a7a13644c629073" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_route_stops_route_id" ON "business"."route_stops" ("routeId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "business"."routes_origen_enum" AS ENUM('CAMPUS_PRINCIPAL', 'EL_BOSQUE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "business"."routes_estado_enum" AS ENUM('ACTIVA', 'CANCELADA', 'FINALIZADA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "business"."routes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "driverId" uuid NOT NULL, "origen" "business"."routes_origen_enum" NOT NULL, "fecha" date NOT NULL, "horaSalida" TIME NOT NULL, "destinoBase" text NOT NULL, "asientosTotales" integer NOT NULL, "asientosDisponibles" integer NOT NULL, "estado" "business"."routes_estado_enum" NOT NULL DEFAULT 'ACTIVA', "mensaje" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_76100511cdfa1d013c859f01d8b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_routes_origen_fecha" ON "business"."routes" ("origen", "fecha") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_routes_fecha_hora_salida" ON "business"."routes" ("fecha", "horaSalida") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_routes_estado" ON "business"."routes" ("estado") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_routes_driver_id" ON "business"."routes" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "business"."ratings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fromUserId" uuid NOT NULL, "toUserId" uuid NOT NULL, "routeId" uuid NOT NULL, "score" integer NOT NULL, "comment" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_ratings_from_to_route" UNIQUE ("fromUserId", "toUserId", "routeId"), CONSTRAINT "PK_0f31425b073219379545ad68ed9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ratings_created_at" ON "business"."ratings" ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ratings_route_id" ON "business"."ratings" ("routeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ratings_to_user_id" ON "business"."ratings" ("toUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ratings_from_user_id" ON "business"."ratings" ("fromUserId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "business"."payouts_status_enum" AS ENUM('PENDING', 'PAID', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "business"."payouts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "driverId" uuid NOT NULL, "period" character varying(7) NOT NULL, "amount" numeric(10,2) NOT NULL, "status" "business"."payouts_status_enum" NOT NULL DEFAULT 'PENDING', "paypalBatchId" character varying(100), "attempts" integer NOT NULL DEFAULT '0', "lastError" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "paidAt" TIMESTAMP, CONSTRAINT "UQ_payouts_driver_period" UNIQUE ("driverId", "period"), CONSTRAINT "PK_76855dc4f0a6c18c72eea302e87" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payouts_created_at" ON "business"."payouts" ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payouts_status" ON "business"."payouts" ("status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "business"."bookings_estado_enum" AS ENUM('CONFIRMADA', 'CANCELADA', 'NO_SHOW', 'COMPLETADA')`,
    );
    await queryRunner.query(
      `CREATE TYPE "business"."bookings_metodopago_enum" AS ENUM('EFECTIVO', 'PAYPAL', 'TARJETA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "business"."bookings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "routeId" uuid NOT NULL, "passengerId" uuid NOT NULL, "estado" "business"."bookings_estado_enum" NOT NULL DEFAULT 'CONFIRMADA', "otp" character varying(6) NOT NULL, "otpUsado" boolean NOT NULL DEFAULT false, "metodoPago" "business"."bookings_metodopago_enum" NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "cancelledAt" TIMESTAMP, CONSTRAINT "UQ_bookings_route_passenger" UNIQUE ("routeId", "passengerId"), CONSTRAINT "PK_bee6805982cc1e248e94ce94957" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bookings_passenger_estado" ON "business"."bookings" ("passengerId", "estado") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bookings_created_at" ON "business"."bookings" ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bookings_estado" ON "business"."bookings" ("estado") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bookings_passenger_id" ON "business"."bookings" ("passengerId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bookings_route_id" ON "business"."bookings" ("routeId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "business"."payments_method_enum" AS ENUM('EFECTIVO', 'PAYPAL', 'TARJETA')`,
    );
    await queryRunner.query(
      `CREATE TYPE "business"."payments_status_enum" AS ENUM('PENDING', 'PAID', 'REVERSED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "business"."payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "bookingId" uuid NOT NULL, "amount" numeric(10,2) NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'USD', "method" "business"."payments_method_enum" NOT NULL, "status" "business"."payments_status_enum" NOT NULL DEFAULT 'PENDING', "paypalOrderId" character varying(100), "paypalCaptureId" character varying(100), "failureReason" text, "payoutId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "paidAt" TIMESTAMP, "reversedAt" TIMESTAMP, CONSTRAINT "UQ_1ead3dc5d71db0ea822706e389d" UNIQUE ("bookingId"), CONSTRAINT "REL_1ead3dc5d71db0ea822706e389" UNIQUE ("bookingId"), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_created_at" ON "business"."payments" ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_paypal_order_id" ON "business"."payments" ("paypalOrderId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_payout_id" ON "business"."payments" ("payoutId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_method" ON "business"."payments" ("method") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_status" ON "business"."payments" ("status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "auth"."auth_users_rol_enum" AS ENUM('USER', 'PASAJERO', 'CONDUCTOR', 'ADMIN')`,
    );
    await queryRunner.query(
      `CREATE TYPE "auth"."auth_users_estadoverificacion_enum" AS ENUM('NO_VERIFICADO', 'VERIFICADO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "auth"."auth_users" ("id" uuid NOT NULL, "email" character varying(30) NOT NULL, "rol" "auth"."auth_users_rol_enum" NOT NULL DEFAULT 'USER', "estadoVerificacion" "auth"."auth_users_estadoverificacion_enum" NOT NULL DEFAULT 'NO_VERIFICADO', "bloqueadoHasta" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_13d8b49e55a8b06bee6bbc828fb" UNIQUE ("email"), CONSTRAINT "PK_c88cc8077366b470dafc2917366" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_users_bloqueado_hasta" ON "auth"."auth_users" ("bloqueadoHasta") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_users_estado_verificacion" ON "auth"."auth_users" ("estadoVerificacion") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_users_rol" ON "auth"."auth_users" ("rol") `,
    );
    await queryRunner.query(
      `CREATE TABLE "auth"."credentials" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "authUserId" uuid NOT NULL, "passwordHash" text NOT NULL, "failedAttempts" integer NOT NULL DEFAULT '0', "lastFailedAttempt" TIMESTAMP, "bloqueadoHasta" TIMESTAMP, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_864854375544b7a70f3d44ded30" UNIQUE ("authUserId"), CONSTRAINT "REL_864854375544b7a70f3d44ded3" UNIQUE ("authUserId"), CONSTRAINT "PK_1e38bc43be6697cdda548ad27a6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_credentials_failed_attempts" ON "auth"."credentials" ("failedAttempts") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_credentials_bloqueado_hasta" ON "auth"."credentials" ("bloqueadoHasta") `,
    );
    await queryRunner.query(
      `CREATE TYPE "audit"."audit_logs_action_enum" AS ENUM('REGISTER', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'ACCOUNT_BLOCKED', 'ACCOUNT_UNBLOCKED', 'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET_COMPLETE', 'PASSWORD_CHANGE', 'PASSWORD_CHANGE_FAILED', 'VERIFICATION_CODE_SENT', 'VERIFICATION_CODE_RESENT', 'VERIFICATION_SUCCESS', 'VERIFICATION_FAILED', 'PROFILE_UPDATE', 'PROFILE_PHOTO_UPDATE', 'ACCOUNT_DEACTIVATED', 'DRIVER_APPLICATION_SUBMITTED', 'DRIVER_APPLICATION_APPROVED', 'DRIVER_APPLICATION_REJECTED', 'DRIVER_VEHICLE_UPDATE', 'ROUTE_CREATED', 'ROUTE_UPDATED', 'ROUTE_CANCELLED_DRIVER', 'ROUTE_STARTED', 'ROUTE_COMPLETED', 'BOOKING_CREATED', 'BOOKING_CANCELLED_PASSENGER', 'BOOKING_NO_SHOW', 'BOOKING_DRIVER_ABSENT', 'TRIP_OTP_GENERATED', 'TRIP_OTP_VALIDATED', 'TRIP_OTP_INVALID', 'PAYMENT_INITIATED', 'PAYMENT_COMPLETED', 'PAYMENT_FAILED', 'PAYMENT_REFUNDED', 'WITHDRAWAL_REQUESTED', 'WITHDRAWAL_COMPLETED', 'WITHDRAWAL_FAILED', 'RATING_GIVEN', 'RATING_USER_BLOCKED', 'UNAUTHORIZED_ACCESS', 'ACCESS_DENIED_ROLE', 'SUSPICIOUS_ACTIVITY', 'TOKEN_INVALID', 'ADMIN_ROLE_CHANGE', 'ADMIN_USER_SUSPENSION', 'ADMIN_CONFIG_CHANGE', 'ADMIN_CREATED', 'EMAIL_SENT', 'EMAIL_FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "audit"."audit_logs_result_enum" AS ENUM('SUCCESS', 'FAILED', 'BLOCKED', 'DENIED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit"."audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "action" "audit"."audit_logs_action_enum" NOT NULL, "userId" uuid, "ipAddress" character varying(45), "userAgent" character varying(512), "result" "audit"."audit_logs_result_enum", "metadata" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_result" ON "audit"."audit_logs" ("result") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_created_at" ON "audit"."audit_logs" ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_user_id" ON "audit"."audit_logs" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_action" ON "audit"."audit_logs" ("action") `,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."user_profiles" ADD CONSTRAINT "FK_8481388d6325e752cd4d7e26c6d" FOREIGN KEY ("userId") REFERENCES "business"."business_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."driver_documents" ADD CONSTRAINT "FK_22eb4a151d293e1bdff7a4dcc5a" FOREIGN KEY ("driverId") REFERENCES "business"."drivers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."vehicles" ADD CONSTRAINT "FK_28d7607488252336b22511e9e80" FOREIGN KEY ("driverId") REFERENCES "business"."drivers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."drivers" ADD CONSTRAINT "FK_57d866371f392f459cd9ee46f6a" FOREIGN KEY ("userId") REFERENCES "business"."business_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."route_stops" ADD CONSTRAINT "FK_352e45964a86c097a435f643004" FOREIGN KEY ("routeId") REFERENCES "business"."routes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."routes" ADD CONSTRAINT "FK_2b32f218055ee12894887aa05cc" FOREIGN KEY ("driverId") REFERENCES "business"."drivers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."ratings" ADD CONSTRAINT "FK_fd94d05641b3a6bdabf02aca740" FOREIGN KEY ("fromUserId") REFERENCES "business"."business_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."ratings" ADD CONSTRAINT "FK_f1d8c3473dc910170bd67a76558" FOREIGN KEY ("toUserId") REFERENCES "business"."business_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."ratings" ADD CONSTRAINT "FK_391c2b423e5400f086b5122432e" FOREIGN KEY ("routeId") REFERENCES "business"."routes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."payouts" ADD CONSTRAINT "FK_432bd34c495ea23e5c182eb0e42" FOREIGN KEY ("driverId") REFERENCES "business"."drivers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."bookings" ADD CONSTRAINT "FK_9cb692ba894df06acfbca67acdf" FOREIGN KEY ("routeId") REFERENCES "business"."routes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."bookings" ADD CONSTRAINT "FK_4ddbabffcf7921575886059d5c0" FOREIGN KEY ("passengerId") REFERENCES "business"."business_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."payments" ADD CONSTRAINT "FK_1ead3dc5d71db0ea822706e389d" FOREIGN KEY ("bookingId") REFERENCES "business"."bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."payments" ADD CONSTRAINT "FK_b0e2ee79417e309910262908d5c" FOREIGN KEY ("payoutId") REFERENCES "business"."payouts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth"."credentials" ADD CONSTRAINT "FK_864854375544b7a70f3d44ded30" FOREIGN KEY ("authUserId") REFERENCES "auth"."auth_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "auth"."credentials" DROP CONSTRAINT "FK_864854375544b7a70f3d44ded30"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."payments" DROP CONSTRAINT "FK_b0e2ee79417e309910262908d5c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."payments" DROP CONSTRAINT "FK_1ead3dc5d71db0ea822706e389d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."bookings" DROP CONSTRAINT "FK_4ddbabffcf7921575886059d5c0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."bookings" DROP CONSTRAINT "FK_9cb692ba894df06acfbca67acdf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."payouts" DROP CONSTRAINT "FK_432bd34c495ea23e5c182eb0e42"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."ratings" DROP CONSTRAINT "FK_391c2b423e5400f086b5122432e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."ratings" DROP CONSTRAINT "FK_f1d8c3473dc910170bd67a76558"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."ratings" DROP CONSTRAINT "FK_fd94d05641b3a6bdabf02aca740"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."routes" DROP CONSTRAINT "FK_2b32f218055ee12894887aa05cc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."route_stops" DROP CONSTRAINT "FK_352e45964a86c097a435f643004"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."drivers" DROP CONSTRAINT "FK_57d866371f392f459cd9ee46f6a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."vehicles" DROP CONSTRAINT "FK_28d7607488252336b22511e9e80"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."driver_documents" DROP CONSTRAINT "FK_22eb4a151d293e1bdff7a4dcc5a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business"."user_profiles" DROP CONSTRAINT "FK_8481388d6325e752cd4d7e26c6d"`,
    );
    await queryRunner.query(`DROP INDEX "audit"."IDX_audit_logs_action"`);
    await queryRunner.query(`DROP INDEX "audit"."IDX_audit_logs_user_id"`);
    await queryRunner.query(`DROP INDEX "audit"."IDX_audit_logs_created_at"`);
    await queryRunner.query(`DROP INDEX "audit"."IDX_audit_logs_result"`);
    await queryRunner.query(`DROP TABLE "audit"."audit_logs"`);
    await queryRunner.query(`DROP TYPE "audit"."audit_logs_result_enum"`);
    await queryRunner.query(`DROP TYPE "audit"."audit_logs_action_enum"`);
    await queryRunner.query(
      `DROP INDEX "auth"."IDX_credentials_bloqueado_hasta"`,
    );
    await queryRunner.query(
      `DROP INDEX "auth"."IDX_credentials_failed_attempts"`,
    );
    await queryRunner.query(`DROP TABLE "auth"."credentials"`);
    await queryRunner.query(`DROP INDEX "auth"."IDX_auth_users_rol"`);
    await queryRunner.query(
      `DROP INDEX "auth"."IDX_auth_users_estado_verificacion"`,
    );
    await queryRunner.query(
      `DROP INDEX "auth"."IDX_auth_users_bloqueado_hasta"`,
    );
    await queryRunner.query(`DROP TABLE "auth"."auth_users"`);
    await queryRunner.query(
      `DROP TYPE "auth"."auth_users_estadoverificacion_enum"`,
    );
    await queryRunner.query(`DROP TYPE "auth"."auth_users_rol_enum"`);
    await queryRunner.query(`DROP INDEX "business"."IDX_payments_status"`);
    await queryRunner.query(`DROP INDEX "business"."IDX_payments_method"`);
    await queryRunner.query(`DROP INDEX "business"."IDX_payments_payout_id"`);
    await queryRunner.query(
      `DROP INDEX "business"."IDX_payments_paypal_order_id"`,
    );
    await queryRunner.query(`DROP INDEX "business"."IDX_payments_created_at"`);
    await queryRunner.query(`DROP TABLE "business"."payments"`);
    await queryRunner.query(`DROP TYPE "business"."payments_status_enum"`);
    await queryRunner.query(`DROP TYPE "business"."payments_method_enum"`);
    await queryRunner.query(`DROP INDEX "business"."IDX_bookings_route_id"`);
    await queryRunner.query(
      `DROP INDEX "business"."IDX_bookings_passenger_id"`,
    );
    await queryRunner.query(`DROP INDEX "business"."IDX_bookings_estado"`);
    await queryRunner.query(`DROP INDEX "business"."IDX_bookings_created_at"`);
    await queryRunner.query(
      `DROP INDEX "business"."IDX_bookings_passenger_estado"`,
    );
    await queryRunner.query(`DROP TABLE "business"."bookings"`);
    await queryRunner.query(`DROP TYPE "business"."bookings_metodopago_enum"`);
    await queryRunner.query(`DROP TYPE "business"."bookings_estado_enum"`);
    await queryRunner.query(`DROP INDEX "business"."IDX_payouts_status"`);
    await queryRunner.query(`DROP INDEX "business"."IDX_payouts_created_at"`);
    await queryRunner.query(`DROP TABLE "business"."payouts"`);
    await queryRunner.query(`DROP TYPE "business"."payouts_status_enum"`);
    await queryRunner.query(`DROP INDEX "business"."IDX_ratings_from_user_id"`);
    await queryRunner.query(`DROP INDEX "business"."IDX_ratings_to_user_id"`);
    await queryRunner.query(`DROP INDEX "business"."IDX_ratings_route_id"`);
    await queryRunner.query(`DROP INDEX "business"."IDX_ratings_created_at"`);
    await queryRunner.query(`DROP TABLE "business"."ratings"`);
    await queryRunner.query(`DROP INDEX "business"."IDX_routes_driver_id"`);
    await queryRunner.query(`DROP INDEX "business"."IDX_routes_estado"`);
    await queryRunner.query(
      `DROP INDEX "business"."IDX_routes_fecha_hora_salida"`,
    );
    await queryRunner.query(`DROP INDEX "business"."IDX_routes_origen_fecha"`);
    await queryRunner.query(`DROP TABLE "business"."routes"`);
    await queryRunner.query(`DROP TYPE "business"."routes_estado_enum"`);
    await queryRunner.query(`DROP TYPE "business"."routes_origen_enum"`);
    await queryRunner.query(`DROP INDEX "business"."IDX_route_stops_route_id"`);
    await queryRunner.query(`DROP TABLE "business"."route_stops"`);
    await queryRunner.query(`DROP INDEX "business"."IDX_drivers_estado"`);
    await queryRunner.query(
      `DROP INDEX "business"."IDX_drivers_fecha_solicitud"`,
    );
    await queryRunner.query(`DROP TABLE "business"."drivers"`);
    await queryRunner.query(`DROP TYPE "business"."drivers_estado_enum"`);
    await queryRunner.query(`DROP INDEX "business"."IDX_vehicles_driver_id"`);
    await queryRunner.query(`DROP INDEX "business"."IDX_vehicles_is_activo"`);
    await queryRunner.query(`DROP TABLE "business"."vehicles"`);
    await queryRunner.query(
      `DROP INDEX "business"."IDX_driver_documents_driver_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "business"."IDX_driver_documents_estado"`,
    );
    await queryRunner.query(`DROP TABLE "business"."driver_documents"`);
    await queryRunner.query(
      `DROP TYPE "business"."driver_documents_estado_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "business"."driver_documents_tipo_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "business"."IDX_business_users_is_deleted"`,
    );
    await queryRunner.query(
      `DROP INDEX "business"."IDX_business_users_created_at"`,
    );
    await queryRunner.query(`DROP TABLE "business"."business_users"`);
    await queryRunner.query(
      `DROP INDEX "business"."IDX_user_profiles_rating_promedio"`,
    );
    await queryRunner.query(
      `DROP INDEX "business"."IDX_user_profiles_is_bloqueado_por_rating"`,
    );
    await queryRunner.query(`DROP TABLE "business"."user_profiles"`);
  }
}
