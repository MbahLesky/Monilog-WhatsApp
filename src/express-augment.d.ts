import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    /** Exact raw request body bytes, captured for signature verification. */
    rawBody?: string;
  }
}
