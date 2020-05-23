import { Controller, ParseUUIDPipe, Get, UseGuards, Param, Query, Put, Body } from '@nestjs/common';
import { ApiTags, ApiParam, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TestVariationsService } from './test-variations.service';
import { TestVariation } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { IgnoreAreaDto } from '../test/dto/ignore-area.dto';

@ApiTags('test-variations')
@Controller('test-variations')
export class TestVariationsController {
  constructor(private testVariations: TestVariationsService, private prismaService: PrismaService) { }

  @Get()
  @ApiQuery({ name: 'projectId', required: true })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  getList(
    @Query('projectId', new ParseUUIDPipe()) projectId,
  ): Promise<TestVariation[]> {
    return this.prismaService.testVariation.findMany({
      where: { projectId }
    });
  }

  @Put('ignoreArea/:variationId')
  @ApiParam({ name: 'variationId', required: true })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  updateIgnoreAreas(
    @Param('variationId', new ParseUUIDPipe()) variationId: string,
    @Body() ignoreAreas: IgnoreAreaDto[],
  ): Promise<TestVariation> {
    return this.testVariations.updateIgnoreAreas(variationId, ignoreAreas);
  }
}
