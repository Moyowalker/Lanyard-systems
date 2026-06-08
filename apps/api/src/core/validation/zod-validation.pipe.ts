import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { ErrorCode } from '@lanyard/contracts';

/**
 * Validates a request payload against a zod schema from @lanyard/contracts and
 * returns the parsed (and defaulted/coerced) value. Used as `@Body(new
 * ZodValidationPipe(Schema))`. Keeps validation rules identical across FE and BE.
 */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        details: result.error.issues.map((issue) => ({
          field: issue.path.join('.') || undefined,
          issue: issue.message,
        })),
      });
    }
    return result.data;
  }
}
