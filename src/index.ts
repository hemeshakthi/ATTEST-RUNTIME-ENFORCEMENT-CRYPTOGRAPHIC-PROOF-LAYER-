import { McpApplicationFactory } from '@nitrostack/core';
import { AppModule } from './app.module';

import { ensureDatabaseReady } from './config/migrate';
import { runtimeProxy } from './enforcement';

async function bootstrap() {
  await ensureDatabaseReady();
  await runtimeProxy.initializeFromDb();
  const server = await McpApplicationFactory.create(AppModule);
  await server.start();
}

bootstrap().catch(err => {
  console.error("Failed to start server", err);
  process.exit(1);
});