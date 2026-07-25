import { cert, getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { config } from "./config";

// Server-only Firebase Admin. Uses the same project as the web + Flutter apps so
// documents written here sync straight into the users' local ledgers. Prefer an
// explicit service account from env; otherwise fall back to Application Default
// Credentials (e.g. GOOGLE_APPLICATION_CREDENTIALS).
function initAdminApp() {
  const existing = getApps()[0];
  if (existing) return existing;

  const { projectId, clientEmail, privateKey } = config.firebase;
  if (projectId && clientEmail && privateKey) {
    return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }

  return initializeApp({ credential: applicationDefault() });
}

const app = initAdminApp();

export const adminAuth: Auth = getAuth(app);
export const adminDb: Firestore = getFirestore(app);
