import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { User as AppUser, AccountingDB } from '../types/accounting';
import {
  setActiveTenantId,
  registerCompany
} from './tenantService';
import { loadTenantDatabase } from './accountingStorage';

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Configure Google Provider with Drive file and Userinfo scopes
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.email');
// Force account selection so user can pick ANY Gmail on their device
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export const GOOGLE_TOKEN_KEY = 'hesabaty_google_access_token';
export const AUTH_USER_KEY = 'hesabaty_active_user';

export interface AuthSession {
  user: AppUser;
  isGoogle: boolean;
  isGoogleLinked?: boolean;
  googleEmail?: string;
  googlePhoto?: string;
  token?: string;
  tenantId?: string;
  companyName?: string;
}

// In-memory token cache for Google Workspace APIs per skill guidelines
let inMemoryAccessToken: string | null = null;

/**
 * Stores the OAuth access token for Google Drive API operations
 */
export function setGoogleAccessToken(token: string | null) {
  inMemoryAccessToken = token;
  if (token) {
    sessionStorage.setItem(GOOGLE_TOKEN_KEY, token);
    localStorage.setItem(GOOGLE_TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(GOOGLE_TOKEN_KEY);
    localStorage.removeItem(GOOGLE_TOKEN_KEY);
  }
}

export function getGoogleAccessToken(): string | null {
  return inMemoryAccessToken || sessionStorage.getItem(GOOGLE_TOKEN_KEY) || localStorage.getItem(GOOGLE_TOKEN_KEY);
}

// Keep in-memory cache and auth state synced
onAuthStateChanged(auth, (user) => {
  if (!user) {
    inMemoryAccessToken = null;
  }
});

/**
 * Sign in directly with Google (selecting any Gmail from phone)
 */
export async function signInWithGoogle(): Promise<{ session: AuthSession; tenantDb: AccountingDB }> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || null;

    if (token) {
      setGoogleAccessToken(token);
    }

    const fbUser = result.user;
    const email = fbUser.email || '';
    const displayName = fbUser.displayName || email.split('@')[0] || 'مستخدم Gmail';

    // Register or retrieve isolated company tenant for this Google account
    const tenant = registerCompany({
      name: `منشأة ${displayName}`,
      adminName: displayName,
      adminUsername: email || 'google_user',
      currency: 'ج.م',
      isGoogle: true,
      googleEmail: email
    });
    setActiveTenantId(tenant.id);

    const tenantDb = loadTenantDatabase(tenant.id);
    if (!tenantDb.settings.company || tenantDb.settings.company === 'المنشأة الرئيسية') {
      tenantDb.settings.company = `منشأة ${displayName}`;
    }

    const sessionUser: AppUser = {
      id: `usr_${fbUser.uid.slice(0, 8)}`,
      name: displayName,
      username: email || 'google_user',
      role: 'مدير',
      active: true,
      lastLogin: new Date().toISOString()
    };

    if (!tenantDb.users.some(u => u.username === sessionUser.username)) {
      tenantDb.users.push(sessionUser);
    }
    tenantDb.currentUser = sessionUser;

    const session: AuthSession = {
      user: sessionUser,
      isGoogle: true,
      isGoogleLinked: true,
      googleEmail: email || undefined,
      googlePhoto: fbUser.photoURL || undefined,
      token: token || undefined,
      tenantId: tenant.id,
      companyName: tenant.name
    };

    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(session));
    return { session, tenantDb };
  } catch (error: any) {
    if (
      error?.code !== 'auth/popup-closed-by-user' &&
      error?.code !== 'auth/cancelled-popup-request'
    ) {
      console.warn('Firebase Google sign-in:', error?.code || error?.message);
    }
    throw error;
  }
}

/**
 * Link or refresh Google Drive account for the current active user
 */
export async function linkGoogleDriveAccount(): Promise<{ email: string; token: string }> {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken || null;
  if (!token) {
    throw new Error('لم يتم استلام تصريح الوصول إلى Google Drive.');
  }

  setGoogleAccessToken(token);
  const email = result.user.email || '';

  const currentSession = getStoredAuthSession();
  if (currentSession) {
    currentSession.isGoogleLinked = true;
    currentSession.googleEmail = email;
    currentSession.token = token;
    if (result.user.photoURL) {
      currentSession.googlePhoto = result.user.photoURL;
    }
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentSession));
  }

  return { email, token };
}

/**
 * Sign in manually with username/password or quick profile
 */
export function signInManual(user: AppUser, tenantId?: string, companyName?: string): AuthSession {
  if (tenantId) {
    setActiveTenantId(tenantId);
  }
  const session: AuthSession = {
    user: {
      ...user,
      lastLogin: new Date().toISOString()
    },
    isGoogle: false,
    tenantId,
    companyName
  };
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(session));
  return session;
}

/**
 * Retrieve saved authentication session
 */
export function getStoredAuthSession(): AuthSession | null {
  try {
    const saved = localStorage.getItem(AUTH_USER_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Log out user and clear sessions
 */
export async function logoutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (err) {
    console.error('Firebase sign out error:', err);
  }
  setGoogleAccessToken(null);
  setActiveTenantId(null);
  localStorage.removeItem(AUTH_USER_KEY);
}
