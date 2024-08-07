import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ILaunchRepostServiceWorkerSession } from '@only-twitter/interfaces';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { TwitterApiService } from '@only-twitter/twitter-api';
import { InjectRepository } from '@nestjs/typeorm';
import { WorkerSession, WorkerSessionState } from '@only-twitter/entities';
import { DataSource, Repository } from 'typeorm';
import { delay } from '@only-twitter/utils';
import { RepostWorker } from '../repost-worker/repost-worker.service';
import { repostServiceWorkerGetWinstonLogger } from '../configs/repost-worker-winston.config';
import { TwitterApiErrorsHandlerService } from '../repost-worker/twitter-api-errors-handler-service';

@Injectable()
export class WorkersOrchestratorService implements OnModuleInit {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    @InjectRepository(WorkerSession)
    private readonly workerSessionRepository: Repository<WorkerSession>,
    private readonly dataSource: DataSource
  ) {}

  private activeWorkerSessions: Map<string, RepostWorker> = new Map();

  async launchWorkers(sessionsParams: ILaunchRepostServiceWorkerSession[]) {
    try {
      for (const workerSessionsParams of sessionsParams) {
        await this.runNewWorker(workerSessionsParams);

        await delay(100);
      }
    } catch (e) {
      this.logger.error(e);
    }
  }

  async runNewWorker(
    launchRepostServiceWorkerSession: ILaunchRepostServiceWorkerSession
  ) {
    const { sessionId, workerAccount, customerId } =
      launchRepostServiceWorkerSession;

    const workerLogger = await repostServiceWorkerGetWinstonLogger(
      customerId,
      workerAccount.twitterUserName
    );
    const apiErrorsHandlerService = new TwitterApiErrorsHandlerService(
      workerLogger
    );
    const twitterApiService = new TwitterApiService(workerLogger);

    // Create a new worker
    const worker = new RepostWorker(
      twitterApiService,
      workerLogger,
      launchRepostServiceWorkerSession,
      apiErrorsHandlerService,
      this.dataSource,
      this.workerSessionRepository
    );

    this.activeWorkerSessions.set(sessionId, worker);

    process.nextTick(async () => {
      try {
        this.logger.log(`worker ${workerAccount.twitterUserName} starting`);
        const stoppedReason = await worker.startService();
        this.activeWorkerSessions.delete(sessionId);
        this.logger.log(
          `worker stopped , reason ${stoppedReason}, ${workerAccount.twitterUserName}`
        );
      } catch (e) {
        this.logger.error(e);
      }
    });
  }

  stopWorkers(workerSessions: string[]) {
    workerSessions.forEach(async (workerSession) => {
      const worker = this.activeWorkerSessions.get(workerSession);

      if (worker) {
        worker.stopWorker();
      } else {
        await this.updateWorkerSession(workerSession, {
          state: WorkerSessionState.Stopped,
        });
      }
    });
  }

  private async launchWorkersOnApplicationStart() {
    this.logger.log('launchWorkersOnApplicationStart entered');

    const activeSessions = await this.workerSessionRepository
      .createQueryBuilder('ws')
      .innerJoinAndSelect('ws.sessionParams', 'sp')
      .innerJoinAndSelect('ws.workerAccount', 'wa')
      .innerJoinAndSelect('wa.proxy', 'proxy')
      .where('ws.state IN (:...states)', {
        states: [
          WorkerSessionState.Starting,
          WorkerSessionState.Working,
          WorkerSessionState.WaitingRestart,
        ],
      })
      .getMany();

    this.logger.debug(
      'launchWorkersOnApplicationStart sessions id to be launched :',
      activeSessions.map((i) => i.id)
    );

    for (const session of activeSessions) {
      session.processingConversationId = null;
    }

    await this.workerSessionRepository.save(activeSessions);

    await this.launchWorkers(
      activeSessions.map(({ id, workerAccount, sessionParams }) => ({
        workerAccount,
        sessionParams,
        customerId: workerAccount.customerId,
        sessionId: id,
      }))
    );
  }

  async onModuleInit() {
    setTimeout(this.launchWorkersOnApplicationStart.bind(this), 10_000);
  }

  private async updateWorkerSession(
    id: string,
    updateParams: Partial<Omit<WorkerSession, 'id'>>
  ) {
    try {
      const existingWorkerSession =
        await this.workerSessionRepository.findOneByOrFail({
          id,
        });

      await this.workerSessionRepository.save(
        Object.assign(existingWorkerSession, updateParams)
      );
    } catch (e) {
      this.logger.error(e);
    }
  }
}
