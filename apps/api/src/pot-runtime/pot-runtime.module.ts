import { Module, forwardRef } from '@nestjs/common';
import { PotRuntimeService } from './pot-runtime.service';
import { DatapotsModule } from '../datapots/datapots.module';

@Module({
  imports: [forwardRef(() => DatapotsModule)],
  providers: [PotRuntimeService],
  exports: [PotRuntimeService],
})
export class PotRuntimeModule {}
