import { Module } from '@nestjs/common';
import { OrchestratorCommands } from './orchestrator.commands';
import { WorkersOrchestratorService } from './workers-orchestrator.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkerSession } from '@only-twitter/entities';

@Module({
  imports: [TypeOrmModule.forFeature([WorkerSession])],
  controllers: [OrchestratorCommands],
  providers: [WorkersOrchestratorService],
})
export class WorkersOrchestratorModule {}
