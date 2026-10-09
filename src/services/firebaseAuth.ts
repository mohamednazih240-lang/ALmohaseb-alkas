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
import { User as AppUser } from '../types/accounting';

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Configure Google Provider with Google Drive file scope
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

const GOOGLE_TOKEN_KEY = 'hesabaty_google_access_token';
const AUTH_USER_KEY = 'hesabaty_active_user';

export interface AuthSession {
  user: AppUser;
  isGoogle: boolean;
  googleEmail?: string;
  googlePhoto?: string;
  token?: string;
}

/**
 * Stores the OAuth access token for Google Drive API operations
 */
export function setGoogleAccessToken(token: string | null) {
  if (token) {
    sessionStorage.setItem(GOOGLE_TOKEN_KEY, token);
    localStorage.setItem(GOOGLE_TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(GOOGLE_TOKEN_KEY);
    localStorage.removeItem(GOOGLE_TOKEN_KEY);
  }
}

export function getGoogleAccessToken(): string | null {
  return sessionStorage.getItem(GOOGLE_TOKEN_KEY) || localStorage.getItem(GOOGLE_TOKEN_KEY);
}

/**
 * Sign in with Google using popup and capture OAuth access token
 */
export async function signInWithGoogle(): Promise<AuthSession> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || null;

    if (token) {
      setGoogleAccessToken(token);
    }

    const fbUser = result.user;
    const sessionUser: AppUser = {
      id: `usr_${fbUser.uid.slice(0, 8)}`,
      name: fbUser.displayName || fbUser.email?.split('@')[0] || 'مستخدم جوجل',
      username: fbUser.email || 'google_user',
      role: 'مدير',
      active: true,
      lastLogin: new Date().toISOString()
    };

    const session: AuthSession = {
      user: sessionUser,
      isGoogle: true,
      googleEmail: fbUser.email || undefined,
      googlePhoto: fbUser.photoURL || undefined,
      token: token || undefined
    };

    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(session));
    return session;
  } catch (error: any) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
}

/**
 * Sign in manually with username/password or quick profile
 */
export function signInManual(user: AppUser): AuthSession {
  const session: AuthSession = {
    user: {
      ...user,
      lastLogin: new Date().toISOString()
    },
    isGoogle: false
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
  localStorage.removeItem(AUTH_USER_KEY);
}
