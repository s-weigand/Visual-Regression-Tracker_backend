import { Test, TestingModule } from '@nestjs/testing';
import { BuildsService } from './builds.service';
import { PrismaService } from '../prisma/prisma.service';
import { TestRunsService } from '../test-runs/test-runs.service';

describe('BuildsService', () => {
  let service: BuildsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BuildsService,
        { provide: PrismaService, useValue: {} },
        { provide: TestRunsService, useValue: {} },
      ],
    }).compile();

    service = module.get<BuildsService>(BuildsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
