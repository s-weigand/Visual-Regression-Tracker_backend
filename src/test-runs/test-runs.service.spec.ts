import { mocked } from 'ts-jest/utils';
import { Test, TestingModule } from '@nestjs/testing';
import { TestRunsService } from './test-runs.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaticService } from '../shared/static/static.service';
import { PNG } from 'pngjs';
import { TestStatus, Build, TestRun } from '@prisma/client';
import Pixelmatch from 'pixelmatch';
import { CreateTestRequestDto } from './dto/create-test-request.dto';
import { DiffResult } from './diffResult';
import { IgnoreAreaDto } from './dto/ignore-area.dto';
import { EventsGateway } from '../events/events.gateway';
import { CommentDto } from '../shared/dto/comment.dto';
import { BuildDto } from '../builds/dto/build.dto';
import { TestVariationsService } from '../test-variations/test-variations.service';

jest.mock('pixelmatch');

const initService = async ({
  testRunDeleteMock = jest.fn(),
  testRunUpdateMock = jest.fn(),
  testRunFindOneMock = jest.fn(),
  testRunFindManyMock = jest.fn(),
  testRunCreateMock = jest.fn(),
  getImageMock = jest.fn(),
  saveImageMock = jest.fn(),
  deleteImageMock = jest.fn(),
  eventNewTestRunMock = jest.fn(),
  eventBuildUpdatedMock = jest.fn(),
  buildFindOneMock = jest.fn(),
}) => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      TestRunsService,
      {
        provide: PrismaService,
        useValue: {
          testRun: {
            delete: testRunDeleteMock,
            findMany: testRunFindManyMock,
            findOne: testRunFindOneMock,
            create: testRunCreateMock,
            update: testRunUpdateMock,
          },
          build: {
            findOne: buildFindOneMock,
          },
        },
      },
      {
        provide: StaticService,
        useValue: {
          getImage: getImageMock,
          saveImage: saveImageMock,
          deleteImage: deleteImageMock,
        },
      },
      {
        provide: EventsGateway,
        useValue: {
          newTestRun: eventNewTestRunMock,
          buildUpdated: eventBuildUpdatedMock,
        },
      },
      {
        provide: TestVariationsService,
        useValue: {},
      },
    ],
  }).compile();

  return module.get<TestRunsService>(TestRunsService);
};
describe('TestRunsService', () => {
  let service: TestRunsService;

  it('findOne', async () => {
    const id = 'some id';
    const testRunFindOneMock = jest.fn();
    service = await initService({
      testRunFindOneMock,
    });

    service.findOne(id);

    expect(testRunFindOneMock).toHaveBeenCalledWith({
      where: { id },
      include: {
        testVariation: true,
      },
    });
  });

  it('reject', async () => {
    const testRun = {
      id: 'id',
      imageName: 'imageName',
      diffTollerancePercent: 12,
      status: TestStatus.new,
      buildId: 'buildId',
      testVariationId: 'testVariationId',
      updatedAt: new Date(),
      createdAt: new Date(),
      name: 'test run name',
      ignoreAreas: '[]',
    };
    const testRunUpdateMock = jest.fn().mockResolvedValueOnce(testRun);
    service = await initService({
      testRunUpdateMock,
    });
    service.emitUpdateBuildEvent = jest.fn();

    await service.reject(testRun.id);

    expect(testRunUpdateMock).toHaveBeenCalledWith({
      where: { id: testRun.id },
      data: {
        status: TestStatus.failed,
      },
    });
    expect(service.emitUpdateBuildEvent).toBeCalledWith(testRun.buildId);
  });

  describe('approve', () => {
    it('can approve', async () => {
      const testRun = {
        id: 'id',
        imageName: 'imageName',
        diffTollerancePercent: 12,
        status: TestStatus.new,
        buildId: 'buildId',
        testVariationId: 'testVariationId',
        updatedAt: new Date(),
        createdAt: new Date(),
        name: 'test run name',
        ignoreAreas: '[]',
      };
      const testRunUpdateMock = jest.fn();
      const testRunFindOneMock = jest.fn().mockResolvedValueOnce(testRun);
      const baselineName = 'some baseline name';
      const saveImageMock = jest.fn().mockReturnValueOnce(baselineName);
      const getImageMock = jest.fn().mockReturnValueOnce(
        new PNG({
          width: 10,
          height: 10,
        })
      );
      service = await initService({
        testRunUpdateMock,
        saveImageMock,
        getImageMock,
      });
      service.findOne = testRunFindOneMock;
      service.emitUpdateBuildEvent = jest.fn();

      await service.approve(testRun.id);

      expect(testRunFindOneMock).toHaveBeenCalledWith(testRun.id);
      expect(getImageMock).toHaveBeenCalledWith(testRun.imageName);
      expect(saveImageMock).toHaveBeenCalledTimes(1);
      expect(testRunUpdateMock).toHaveBeenCalledWith({
        where: { id: testRun.id },
        data: {
          status: TestStatus.approved,
          testVariation: {
            update: {
              baselineName,
              baselines: {
                create: {
                  baselineName,
                  testRun: {
                    connect: {
                      id: testRun.id,
                    },
                  },
                },
              },
            },
          },
        },
      });
      expect(service.emitUpdateBuildEvent).toBeCalledWith(testRun.buildId);
    });
  });

  it('create', async () => {
    const initCreateTestRequestDto: CreateTestRequestDto = {
      buildId: 'buildId',
      projectId: 'projectId',
      name: 'Test name',
      imageBase64: 'Image',
      os: 'OS',
      browser: 'browser',
      viewport: 'viewport',
      device: 'device',
      diffTollerancePercent: undefined,
    };
    const testRunWithResult = {
      id: 'id',
      imageName: 'imageName',
      baselineName: 'baselineName',
      diffTollerancePercent: 1,
      ignoreAreas: '[]',
      diffName: 'diffName',
      status: TestStatus.unresolved,
    };

    const testRun = {
      id: 'id',
      imageName: 'imageName',
      baselineName: 'baselineName',
      diffTollerancePercent: 1,
      ignoreAreas: '[]',
      diffName: null,
    };
    const testVariation = {
      id: '123',
      projectId: 'project Id',
      name: 'Test name',
      baselineName: 'baselineName',
      os: 'OS',
      browser: 'browser',
      viewport: 'viewport',
      device: 'device',
      ignoreAreas: '[]',
      comment: 'some comment',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const createTestRequestDto = initCreateTestRequestDto;
    const testRunCreateMock = jest.fn().mockResolvedValueOnce(testRun);
    const imageName = 'image name';
    const saveImageMock = jest.fn().mockReturnValueOnce(imageName);
    const image = 'image';
    const baseline = 'baseline';
    const getImageMock = jest
      .fn()
      .mockReturnValueOnce(baseline)
      .mockReturnValueOnce(image);
    const eventNewTestRunMock = jest.fn();
    service = await initService({ testRunCreateMock, saveImageMock, getImageMock, eventNewTestRunMock });
    const diffResult: DiffResult = {
      status: TestStatus.unresolved,
      diffName: 'diff image name',
      pixelMisMatchCount: 11,
      diffPercent: 22,
      isSameDimension: true,
    };
    const getDiffMock = jest.fn().mockReturnValueOnce(diffResult);
    service.getDiff = getDiffMock;
    const saveDiffResultMock = jest.fn();
    service.saveDiffResult = saveDiffResultMock.mockResolvedValueOnce(testRunWithResult);

    const result = await service.create(testVariation, createTestRequestDto);

    expect(saveImageMock).toHaveBeenCalledWith('screenshot', Buffer.from(createTestRequestDto.imageBase64, 'base64'));
    expect(service.getDiff).toHaveBeenCalledWith(
      baseline,
      image,
      testRun.diffTollerancePercent,
      testVariation.ignoreAreas
    );
    expect(getImageMock).toHaveBeenNthCalledWith(1, testVariation.baselineName);
    expect(getImageMock).toHaveBeenNthCalledWith(2, imageName);
    expect(testRunCreateMock).toHaveBeenCalledWith({
      data: {
        imageName,
        testVariation: {
          connect: {
            id: testVariation.id,
          },
        },
        build: {
          connect: {
            id: createTestRequestDto.buildId,
          },
        },
        name: testVariation.name,
        browser: testVariation.browser,
        device: testVariation.device,
        os: testVariation.os,
        viewport: testVariation.viewport,
        baselineName: testVariation.baselineName,
        ignoreAreas: testVariation.ignoreAreas,
        comment: testVariation.comment,
        diffTollerancePercent: createTestRequestDto.diffTollerancePercent,
        status: TestStatus.new,
      },
    });
    expect(getDiffMock).toHaveBeenCalledWith(baseline, image, testRun.diffTollerancePercent, testRun.ignoreAreas);
    expect(saveDiffResultMock).toHaveBeenCalledWith(testRun.id, diffResult);
    expect(eventNewTestRunMock).toHaveBeenCalledWith(testRunWithResult);
    expect(result).toBe(testRunWithResult);
  });

  describe('getDiff', () => {
    it('no baseline', async () => {
      const baseline = null;
      const image = new PNG({
        width: 20,
        height: 20,
      });
      service = await initService({});

      const result = service.getDiff(baseline, image, 0, '[]');

      expect(result).toStrictEqual({
        status: undefined,
        diffName: null,
        pixelMisMatchCount: undefined,
        diffPercent: undefined,
        isSameDimension: undefined,
      });
    });

    it('diff image dimensions mismatch', async () => {
      const baseline = new PNG({
        width: 10,
        height: 10,
      });
      const image = new PNG({
        width: 20,
        height: 20,
      });
      service = await initService({});

      const result = service.getDiff(baseline, image, 0, '[]');

      expect(result).toStrictEqual({
        status: TestStatus.unresolved,
        diffName: null,
        pixelMisMatchCount: undefined,
        diffPercent: undefined,
        isSameDimension: false,
      });
    });

    it('diff not found', async () => {
      const baseline = new PNG({
        width: 10,
        height: 10,
      });
      const image = new PNG({
        width: 10,
        height: 10,
      });
      service = await initService({});
      mocked(Pixelmatch).mockReturnValueOnce(0);

      const result = service.getDiff(baseline, image, 0, '[]');

      expect(result).toStrictEqual({
        status: TestStatus.ok,
        diffName: null,
        pixelMisMatchCount: 0,
        diffPercent: 0,
        isSameDimension: true,
      });
    });

    it('diff found < tollerance', async () => {
      const baseline = new PNG({
        width: 100,
        height: 100,
      });
      const image = new PNG({
        width: 100,
        height: 100,
      });
      const saveImageMock = jest.fn();
      service = await initService({ saveImageMock });
      const pixelMisMatchCount = 150;
      mocked(Pixelmatch).mockReturnValueOnce(pixelMisMatchCount);

      const result = service.getDiff(baseline, image, 1.5, '[]');

      expect(saveImageMock).toHaveBeenCalledTimes(0);
      expect(result).toStrictEqual({
        status: TestStatus.ok,
        diffName: null,
        pixelMisMatchCount,
        diffPercent: 1.5,
        isSameDimension: true,
      });
    });

    it('diff found > tollerance', async () => {
      const baseline = new PNG({
        width: 100,
        height: 100,
      });
      const image = new PNG({
        width: 100,
        height: 100,
      });
      const pixelMisMatchCount = 200;
      mocked(Pixelmatch).mockReturnValueOnce(pixelMisMatchCount);
      const diffName = 'diff name';
      const saveImageMock = jest.fn().mockReturnValueOnce(diffName);
      service = await initService({
        saveImageMock,
      });

      const result = service.getDiff(baseline, image, 1, '[]');

      expect(saveImageMock).toHaveBeenCalledTimes(1);
      expect(result).toStrictEqual({
        status: TestStatus.unresolved,
        diffName,
        pixelMisMatchCount,
        diffPercent: 2,
        isSameDimension: true,
      });
    });
  });

  it('calculate no diff', async () => {
    const testRun = {
      id: 'id',
      imageName: 'imageName',
      baselineName: 'baselineName',
      diffTollerancePercent: 12,
      ignoreAreas: '[]',
      diffName: null,
    };
    const testRunFindOneMock = jest.fn().mockResolvedValueOnce(testRun);
    const testRunUpdateMock = jest.fn();
    const baselineMock = 'baseline image';
    const imageeMock = 'image';
    const getImageMock = jest
      .fn()
      .mockReturnValueOnce(baselineMock)
      .mockReturnValueOnce(imageeMock);
    const deleteImageMock = jest.fn();
    const diffResult = {
      id: 'test',
    };
    const getDiffMock = jest.fn().mockReturnValue(diffResult);
    service = await initService({
      testRunUpdateMock,
      getImageMock,
      deleteImageMock,
    });
    service.findOne = testRunFindOneMock;
    service.getDiff = getDiffMock;

    await service.recalculateDiff(testRun.id);

    expect(testRunFindOneMock).toHaveBeenCalledWith(testRun.id);
    expect(getImageMock).toHaveBeenNthCalledWith(1, testRun.baselineName);
    expect(getImageMock).toHaveBeenNthCalledWith(2, testRun.imageName);
    expect(deleteImageMock).toHaveBeenCalledWith(testRun.diffName);
    expect(getDiffMock).toHaveBeenCalledWith(
      baselineMock,
      imageeMock,
      testRun.diffTollerancePercent,
      testRun.ignoreAreas
    );
  });

  describe('saveDiffResult', () => {
    it('no results', async () => {
      const id = 'some id';
      const testRunUpdateMock = jest.fn();
      service = await initService({
        testRunUpdateMock,
      });

      await service.saveDiffResult(id, null);

      expect(testRunUpdateMock).toHaveBeenCalledWith({
        where: { id },
        data: {
          status: TestStatus.new,
          diffName: null,
          pixelMisMatchCount: null,
          diffPercent: null,
        },
      });
    });
  });

  it('with results', async () => {
    const diff: DiffResult = {
      status: TestStatus.unresolved,
      diffName: 'diff image name',
      pixelMisMatchCount: 11,
      diffPercent: 22,
      isSameDimension: true,
    };
    const id = 'some id';
    const testRunUpdateMock = jest.fn();
    service = await initService({
      testRunUpdateMock,
    });

    await service.saveDiffResult(id, diff);

    expect(testRunUpdateMock).toHaveBeenCalledWith({
      where: { id },
      data: {
        status: diff.status,
        diffName: diff.diffName,
        pixelMisMatchCount: diff.pixelMisMatchCount,
        diffPercent: diff.diffPercent,
      },
    });
  });

  it('findMany', async () => {
    const buildId = 'some id';
    const testRunFindManyMock = jest.fn();
    service = await initService({
      testRunFindManyMock,
    });

    await service.findMany(buildId);

    expect(testRunFindManyMock).toHaveBeenCalledWith({
      where: { buildId },
    });
  });

  it('delete', async () => {
    const id = 'some id';
    const testRun = {
      diffName: 'diffName',
      imageName: 'imageName',
    };
    const findOneMock = jest.fn().mockResolvedValueOnce(testRun);
    const deleteImageMock = jest.fn();
    const testRunDeleteMock = jest.fn();
    service = await initService({
      deleteImageMock,
      testRunDeleteMock,
    });
    service.findOne = findOneMock;

    await service.delete(id);

    expect(findOneMock).toHaveBeenCalledWith(id);
    expect(deleteImageMock).toHaveBeenNthCalledWith(1, testRun.diffName);
    expect(deleteImageMock).toHaveBeenNthCalledWith(2, testRun.imageName);
    expect(testRunDeleteMock).toHaveBeenCalledWith({
      where: { id },
    });
  });

  it('updateIgnoreAreas', async () => {
    const id = 'some id';
    const ignoreAreas: IgnoreAreaDto[] = [{ x: 1, y: 2, width: 10, height: 20 }];
    const testRunUpdateMock = jest.fn();
    service = await initService({
      testRunUpdateMock,
    });

    await service.updateIgnoreAreas(id, ignoreAreas);

    expect(testRunUpdateMock).toHaveBeenCalledWith({
      where: { id },
      data: {
        ignoreAreas: JSON.stringify(ignoreAreas),
      },
    });
  });

  it('updateComment', async () => {
    const id = 'some id';
    const commentDto: CommentDto = {
      comment: 'random comment',
    };
    const testRunUpdateMock = jest.fn();
    service = await initService({
      testRunUpdateMock,
    });

    await service.updateComment(id, commentDto);

    expect(testRunUpdateMock).toHaveBeenCalledWith({
      where: { id },
      data: {
        comment: commentDto.comment,
      },
    });
  });

  it('emitUpdateBuildEvent', async () => {
    const build: Build & {
      testRuns: TestRun[];
    } = {
      id: 'a9385fc1-884d-4f9f-915e-40da0e7773d5',
      number: null,
      branchName: 'develop',
      status: null,
      projectId: 'e0a37894-6f29-478d-b13e-6182fecc715e',
      updatedAt: new Date(),
      createdAt: new Date(),
      userId: null,
      testRuns: [
        {
          id: '10fb5e02-64e0-4cf5-9f17-c00ab3c96658',
          imageName: '1592423768112.screenshot.png',
          diffName: null,
          diffPercent: null,
          diffTollerancePercent: 1,
          pixelMisMatchCount: null,
          status: 'new',
          buildId: '146e7a8d-89f0-4565-aa2c-e61efabb0afd',
          testVariationId: '3bc4a5bc-006e-4d43-8e4e-eaa132627fca',
          updatedAt: new Date(),
          createdAt: new Date(),
          name: 'ss2f77',
          browser: 'chromium',
          device: null,
          os: null,
          viewport: '1800x1600',
          baselineName: null,
          ignoreAreas: '[]',
          comment: 'some comment',
        },
      ],
    };
    const buildFindOneMock = jest.fn().mockResolvedValueOnce(build);
    const eventBuildUpdatedMock = jest.fn();
    service = await initService({
      buildFindOneMock,
      eventBuildUpdatedMock,
    });

    await service.emitUpdateBuildEvent(build.id);

    expect(buildFindOneMock).toHaveBeenCalledWith({
      where: {
        id: build.id,
      },
      include: {
        testRuns: true,
      },
    });
    expect(eventBuildUpdatedMock).toHaveBeenCalledWith(new BuildDto(build));
  });
});
