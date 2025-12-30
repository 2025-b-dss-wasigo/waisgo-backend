import { MigrationInterface, QueryRunner } from "typeorm";

export class DriverReject1767109019670 implements MigrationInterface {
    name = 'DriverReject1767109019670'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "business"."drivers" ADD "fechaRechazo" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "business"."drivers" DROP COLUMN "fechaRechazo"`);
    }

}
