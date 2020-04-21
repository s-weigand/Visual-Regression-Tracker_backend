import {
  Controller,
  Get,
  UseGuards,
  Param,
  ParseIntPipe,
  Post,
  Body,
} from '@nestjs/common';
import {
  ApiTags,
  ApiParam,
  ApiOkResponse,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { TestsService } from './tests.service';
import { Test } from './test.entity';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateTestDto } from './dto/create-test.dto';
import { ApiGuard } from 'src/auth/guards/api.guard';

@Controller('tests')
@ApiTags('tests')
export class TestsController {
  constructor(private testsService: TestsService) {}

  @Get(':buildId')
  @ApiParam({ name: 'buildId', required: true })
  @ApiOkResponse({ type: [Test] })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  getAll(@Param('buildId', new ParseIntPipe()) buildId: number): Promise<Test[]> {
    return this.testsService.findAll(buildId);
  }

  @Post()
  @ApiOkResponse({ type: Test })
  @ApiSecurity('api_key')
  @UseGuards(ApiGuard)
  create(@Body() createTestDto: CreateTestDto): Promise<Test> {
    return this.testsService.create(createTestDto);
  }
}
