/// <reference types="astro/client" />

import type { StoredTokens } from '@/features/auth/session';

declare global {
  namespace App {
    interface SessionData {
      jiraTokens: StoredTokens;
    }
  }
}
