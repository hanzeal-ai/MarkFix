import { ConflictException } from '@nestjs/common';

export const maximumArtifactBytes = 20 * 1024 * 1024;

export const pngUploadBytes = (input: unknown): Buffer => {
  if (!Buffer.isBuffer(input)) throw new ConflictException('Expected PNG bytes');
  return input;
};
