import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { ApiError } from '../utils/ApiError';

const dir = path.join(process.cwd(), 'uploads', 'notices');
fs.mkdirSync(dir, { recursive: true });

// Files are saved on the server's disk for now. Phase 11 can swap this for Cloudinary/S3.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dir),
  // Random name: we never trust the client's filename for the path on disk
  filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.pdf`),
});

export const uploadPdf = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') return cb(new ApiError(400, 'Only PDF files are allowed'));
    cb(null, true);
  },
});
