import { DataSource } from 'typeorm';

export const truncateAllTables = async (
  dataSource: DataSource,
): Promise<void> => {
  await dataSource.query(`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN (
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname IN ('auth', 'business')
      ) LOOP
        EXECUTE format(
          'TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE;',
          r.schemaname,
          r.tablename
        );
      END LOOP;
    END $$;
  `);
};
