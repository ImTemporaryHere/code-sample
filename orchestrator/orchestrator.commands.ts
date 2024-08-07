import { Body, Controller, Inject, Logger } from '@nestjs/common';
import { RMQRoute, RMQValidate } from 'nestjs-rmq';
import {
  RepostServiceWorkersOrchestratorLaunchWorkers,
  RepostServiceWorkersOrchestratorStopWorkers,
} from '@only-twitter/contracts';
import { WorkersOrchestratorService } from './workers-orchestrator.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
@Controller()
export class OrchestratorCommands {
  constructor(
    private workersOrchestrator: WorkersOrchestratorService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {}

  @RMQValidate()
  @RMQRoute(RepostServiceWorkersOrchestratorLaunchWorkers.topic)
  launchWorkers(
    @Body()
    {
      workersSessionParams,
    }: RepostServiceWorkersOrchestratorLaunchWorkers.Request
  ) {
    try {
      this.logger.log('launchWorkers', workersSessionParams);
      this.workersOrchestrator.launchWorkers(workersSessionParams);
    } catch (e) {
      this.logger.error(e);
    }
  }

  @RMQValidate()
  @RMQRoute(RepostServiceWorkersOrchestratorStopWorkers.topic)
  stopWorkers(
    @Body()
    { workerSessions }: RepostServiceWorkersOrchestratorStopWorkers.Request
  ) {
    try {
      this.logger.log('stopWorkers sessions', workerSessions);
      this.workersOrchestrator.stopWorkers(workerSessions);
      return {
        success: true,
      };
    } catch (e) {
      this.logger.error(e);
    }
  }
}
