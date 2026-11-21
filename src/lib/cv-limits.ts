/**
 * Largest CV upload. Kept under Vercel's 4.5 MB request body limit, since the file travels in a
 * server action request. Shared by the upload form (client) and uploadCv (server).
 */
export const MAX_CV_BYTES = 4 * 1024 * 1024;
export const CV_TOO_LARGE_MESSAGE = "The file is too large. The maximum size is 4 MB.";
