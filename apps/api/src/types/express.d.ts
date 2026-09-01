import type { UserRole } from "@learning-platform/shared";

declare global {
  namespace Express {
    interface AuthPrincipal {
      userId: string;
      email: string;
      sessionId: string;
      roles: UserRole[];
      mfaVerifiedAt: Date | null;
    }

    interface Request {
      requestId: string;
      csrfToken?: string;
      principal?: AuthPrincipal;
    }
  }
}

export {};
