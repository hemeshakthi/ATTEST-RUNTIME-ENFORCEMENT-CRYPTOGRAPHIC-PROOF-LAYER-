import { McpApp, Module } from '@nitrostack/core';
import { BankingModule } from './modules/banking/banking.tools';
import { HRModule } from './modules/hr/hr.tools';

@Module({
  name: 'root',
  imports: [BankingModule, HRModule]
})
export class RootModule {}

@McpApp({
  module: RootModule,
  server: {
    name: 'AttestServer',
    version: '1.0.0'
  },
  transport: { type: 'stdio' }
})
export class AppModule {}