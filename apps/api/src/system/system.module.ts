import { Module, forwardRef } from '@nestjs/common';
import { SystemController } from './system.controller';
import { AuthModule } from '../auth/auth.module';
import { DatapotsModule } from '../datapots/datapots.module';
import { PotRuntimeModule } from '../pot-runtime/pot-runtime.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    forwardRef(() => DatapotsModule),
    forwardRef(() => PotRuntimeModule),
  ],
  controllers: [SystemController],
})
export class SystemModule {}
