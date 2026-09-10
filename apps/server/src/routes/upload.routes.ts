import type { FastifyInstance } from 'fastify';
import { createWriteStream } from 'node:fs';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { env } from '../config/env.js';
import { generateToken } from '../lib/crypto.js';
import { BadRequestError } from '../lib/errors.js';
import { requireWorkspace } from '../lib/guards.js';

const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);
const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/zip',
  'application/gzip',
  'application/octet-stream',
]);

/**
 * Generic file upload endpoint. Files are written to `UPLOAD_DIR` with a random
 * name (never the client-supplied one) and served back from `/uploads/<name>`.
 *
 * The uploader must be an active member of `workspaceId`, so a file can never
 * be attached to a workspace the caller cannot see.
 */
export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  app.post('/workspaces/:workspaceId/uploads', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId);

    const file = await request.file();
    if (!file) throw new BadRequestError('No file was uploaded');

    const isImage = IMAGE_TYPES.has(file.mimetype);
    const isDocument = DOCUMENT_TYPES.has(file.mimetype) || file.mimetype.startsWith('text/');
    if (!isImage && !isDocument) {
      throw new BadRequestError(`Unsupported file type: ${file.mimetype}`);
    }

    // Sanitize the extension: keep only a short alphanumeric suffix.
    const rawExtension = extname(file.filename).toLowerCase();
    const extension = /^\.[a-z0-9]{1,8}$/.test(rawExtension) ? rawExtension : '';
    const filename = `${isImage ? 'image' : 'file'}-${ctx.user.id.slice(-6)}-${generateToken(8)}${extension}`;
    const target = join(env.uploadDirAbsolute, filename);

    await pipeline(file.file, createWriteStream(target));
    if (file.file.truncated) throw new BadRequestError('That file is larger than the 5MB limit');

    return reply.status(201).send({
      url: `/uploads/${filename}`,
      filename: file.filename.slice(0, 200),
      mimeType: file.mimetype,
      size: file.file.bytesRead,
    });
  });
}
