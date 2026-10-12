import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { ApiError } from '../utils/ApiError';

const dir = path.join(process.cwd(), 'uploads', 'complaints');
fs.mkdirSync(dir, { recursive: true });

// The file extension comes from the checked mime type, never from the client's file name
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dir),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${EXTENSIONS[file.mimetype]}`),
});

export const uploadEvidence = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 }, // 5 MB each, 5 files per request
  fileFilter: (_req, file, cb) => {
    if (!EXTENSIONS[file.mimetype]) {
      return cb(new ApiError(400, 'Only JPG, PNG, WEBP or PDF files are allowed'));
    }
    cb(null, true);
  },
});
