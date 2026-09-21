import { Module } from '@nestjs/common';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SystemModule } from './system/system.module';
import { DatapotsModule } from './datapots/datapots.module';
import { PotRuntimeModule } from './pot-runtime/pot-runtime.module';

@Module({
  imports: [
    BootstrapModule,
    DatabaseModule,
    AuthModule,
    UsersModule,
    SystemModule,
    DatapotsModule,
    PotRuntimeModule,
  ],
})
export class AppModule {}
