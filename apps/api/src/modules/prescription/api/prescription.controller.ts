import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  CreatePrescriptionMetaInput,
  CreatePrescriptionMetaSchema,
  ErrorCode,
  PaginationQuery,
  PaginationQuerySchema,
} from '@lanyard/contracts';

import { CurrentUser, RequireRealm } from '../../../core/auth/auth.decorators';
import { RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { PrescriptionService, UploadedRxFile } from '../application/prescription.service';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const MAX_FILE_BYTES = 10 * 1024 * 1024; // mirrors PRESCRIPTION_MAX_FILE_MB default

/** Customer prescription upload + history + signed-URL access to own files. */
@ApiTags('prescriptions')
@ApiBearerAuth()
@Controller('prescriptions')
@UseGuards(RealmGuard)
@RequireRealm('customer')
export class PrescriptionController {
  constructor(private readonly prescriptions: PrescriptionService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { fileSize: MAX_FILE_BYTES } }))
  create(
    @CurrentUser() user: AuthPrincipal,
    @UploadedFiles() files: Express.Multer.File[],
    @Body(new ZodValidationPipe(CreatePrescriptionMetaSchema)) meta: CreatePrescriptionMetaInput,
  ) {
    const mapped = this.mapFiles(files);
    return this.prescriptions.create(user.sub, meta, mapped);
  }

  @Get()
  list(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.prescriptions.listMine(user.sub, query);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.prescriptions.getMine(user.sub, id);
  }

  @Get(':id/files/:fileId/url')
  fileUrl(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    return this.prescriptions.getMyFileUrl(user, id, fileId);
  }

  private mapFiles(files: Express.Multer.File[]): UploadedRxFile[] {
    if (!files || files.length === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'At least one file is required',
      });
    }
    return files.map((f) => {
      const ext = MIME_EXT[f.mimetype];
      if (!ext) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `Unsupported file type: ${f.mimetype}`,
        });
      }
      return { buffer: f.buffer, mime: f.mimetype, sizeBytes: f.size, ext };
    });
  }
}
