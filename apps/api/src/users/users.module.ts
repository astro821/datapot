import { Module, forwardRef } from '@nestjs/common';
import { UserStore } from './user.store';
import { UsersController } from './users.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [forwardRef(() => AuthModule)],
  providers: [UserStore],
  controllers: [UsersController],
  exports: [UserStore],
})
export class UsersModule {}
