import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../../lib/jwt.js';
import { AppError } from '../../plugins/error-handler.js';
import { randomUUID } from 'crypto';
import { writeFile, mkdir, unlink, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';

interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
}

// Upload request body
interface UploadIconRequest {
  data: string; // Base64-encoded image data
  filename: string; // Original filename for extension detection
}

// Allowed image extensions
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const MAX_FILE_SIZE = 1024 * 1024; // 1MB

// Get uploads directory path
function getUploadsDir(): string {
  return join(process.cwd(), 'uploads', 'icons');
}

// Validate base64 string
function isValidBase64(str: string): boolean {
  // Check for data URL format or raw base64
  const base64Regex = /^(?:data:[^;]+;base64,)?[A-Za-z0-9+/]+=*$/;
  return base64Regex.test(str.replace(/\s/g, ''));
}

// Extract base64 data from data URL or raw base64
function extractBase64Data(str: string): string {
  if (str.startsWith('data:')) {
    const base64Index = str.indexOf('base64,');
    if (base64Index !== -1) {
      return str.substring(base64Index + 7);
    }
  }
  return str;
}

export async function uploadRoutes(app: FastifyInstance) {
  // Ensure uploads directory exists
  const uploadsDir = getUploadsDir();
  if (!existsSync(uploadsDir)) {
    await mkdir(uploadsDir, { recursive: true });
  }

  // Middleware to require authentication
  const requireAuth = async (request: FastifyRequest, _reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw AppError.unauthorized('Missing authorization header');
    }

    const token = authHeader.substring(7);
    const payload = await verifyAccessToken(token);

    if (!payload?.sub) {
      throw AppError.unauthorized('Invalid or expired token');
    }

    (request as AuthenticatedRequest).userId = payload.sub;
  };

  // POST /uploads/icons - Upload an icon file (base64 encoded)
  app.post('/uploads/icons', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const body = request.body as UploadIconRequest;

    if (!body?.data || !body?.filename) {
      throw AppError.badRequest('Missing required fields: data (base64), filename');
    }

    // Validate file extension
    const ext = extname(body.filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw AppError.badRequest(`Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
    }

    // Validate base64 format
    if (!isValidBase64(body.data)) {
      throw AppError.badRequest('Invalid base64 data');
    }

    // Extract and decode base64 data
    const base64Data = extractBase64Data(body.data);
    const buffer = Buffer.from(base64Data, 'base64');

    // Validate file size
    if (buffer.length > MAX_FILE_SIZE) {
      throw AppError.badRequest(`File too large. Maximum size: ${MAX_FILE_SIZE / 1024}KB`);
    }

    // Generate unique filename
    const uniqueFilename = `${randomUUID()}${ext}`;
    const filePath = join(uploadsDir, uniqueFilename);

    // Save file
    await writeFile(filePath, buffer);

    // Return the icon URL path
    const iconUrl = `/uploads/icons/${uniqueFilename}`;

    reply.status(201);
    return {
      success: true,
      filename: uniqueFilename,
      url: iconUrl,
      originalName: body.filename,
      size: buffer.length,
    };
  });

  // GET /uploads/icons/:filename - Serve an icon file
  app.get('/uploads/icons/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };

    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    if (sanitizedFilename !== filename) {
      throw AppError.badRequest('Invalid filename');
    }

    const filePath = join(uploadsDir, sanitizedFilename);

    // Check if file exists
    if (!existsSync(filePath)) {
      throw AppError.notFound('Icon not found');
    }

    // Read file
    const fileData = await readFile(filePath);

    // Determine content type
    const ext = extname(sanitizedFilename).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';

    // Set cache headers (cache for 1 day)
    reply.header('Cache-Control', 'public, max-age=86400');
    reply.header('Content-Type', contentType);

    return reply.send(fileData);
  });

  // DELETE /uploads/icons/:filename - Delete an icon file
  app.delete('/uploads/icons/:filename', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { filename } = request.params as { filename: string };

    // Sanitize filename
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    if (sanitizedFilename !== filename) {
      throw AppError.badRequest('Invalid filename');
    }

    const filePath = join(uploadsDir, sanitizedFilename);

    // Check if file exists
    if (!existsSync(filePath)) {
      throw AppError.notFound('Icon not found');
    }

    // Delete file
    await unlink(filePath);

    reply.status(204);
    return;
  });

  // GET /uploads/icons - List all uploaded icons
  app.get('/uploads/icons', {
    preHandler: [requireAuth],
  }, async () => {
    const { readdir, stat } = await import('fs/promises');
    const files = await readdir(uploadsDir);

    const icons = await Promise.all(
      files.map(async (filename) => {
        const filePath = join(uploadsDir, filename);
        const stats = await stat(filePath);
        return {
          filename,
          url: `/uploads/icons/${filename}`,
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
        };
      })
    );

    return { icons };
  });
}
