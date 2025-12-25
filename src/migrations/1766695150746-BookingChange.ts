import { MigrationInterface, QueryRunner } from "typeorm";

export class BookingChange1766695150746 implements MigrationInterface {
    name = 'BookingChange1766695150746'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_bookings_passenger_estado" ON "business"."bookings" ("passengerId", "estado") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "business"."IDX_bookings_passenger_estado"`);
    }

}
