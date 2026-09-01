import type { AppConfig } from "./config/env.js";
import { createRepositories } from "./repositories/index.js";
import { AuthService } from "./services/auth.service.js";
import { BookingService } from "./services/booking.service.js";
import { LocalDocumentStorage } from "./services/document-storage.service.js";
import { EmailService } from "./services/email.service.js";
import { ModerationService } from "./services/moderation.service.js";
import {
  AdminService,
  EducatorService,
  ProfileService,
  SubjectService,
} from "./services/platform.service.js";
import type { ApiServices } from "./services/types.js";

export function createApiServices(config: AppConfig): ApiServices {
  const repositories = createRepositories();
  const email = new EmailService(config.email);
  const storage = new LocalDocumentStorage(config.uploads.dir);
  return {
    auth: new AuthService(repositories, config),
    profiles: new ProfileService(repositories),
    subjects: new SubjectService(repositories),
    educators: new EducatorService(repositories, config, email, storage),
    admin: new AdminService(repositories, config, email, storage),
    bookings: new BookingService(repositories),
    moderation: new ModerationService(repositories, config),
  };
}
