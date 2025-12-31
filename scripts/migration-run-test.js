const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const envFile =
  process.env.TEST_ENV_FILE || path.join(process.cwd(), '.env.test');

if (!fs.existsSync(envFile)) {
  console.error(
    `[migration:test] Missing ${envFile}. Create it from .env.test.template.`,
  );
  process.exit(1);
}

process.env.NODE_ENV = 'test';

try {
  execSync('npm run typeorm -- -d ormconfig.migration.ts migration:run', {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  });
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message : 'Migration failed';
  console.error(`[migration:test] ${message}`);
  process.exit(1);
}
