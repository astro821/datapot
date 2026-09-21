import { Module, forwardRef } from '@nestjs/common';
import { DataPotStore } from './datapot.store';
import { PotRecordStore } from './pot-record.store';
import { PotSequenceService } from './pot-sequence.service';
import { DatapotsController } from './datapots.controller';
import { PotRuntimeModule } from '../pot-runtime/pot-runtime.module';

@Module({
  imports: [forwardRef(() => PotRuntimeModule)],
  providers: [DataPotStore, PotRecordStore, PotSequenceService],
  controllers: [DatapotsController],
  exports: [DataPotStore, PotRecordStore, PotSequenceService],
})
export class DatapotsModule {}
