import firebaseConfig from '../../firebase-applet-config.json';
import { User as AppUser } from '../types/accounting';
import { AuthSession, setGoogleAccessToken, AUTH_USER_KEY } from './firebaseAuth';
import { registerCompany, setActiveTenantId, getActiveTenantId, updateCompany } from './tenantService';

declare global {
  interface Window {
    google?: any;
    gapi?: any;
  }
}

const SCOPES = 'https://www.googleapis.com/auth/drive.file email profile openid';

/**
 * Loads the Google Identity Services client script dynamically if not already loaded
 */
export function loadGoogleIdentityScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      return resolve();
    }

    const checkInterval = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(checkInterval);
        return resolve();
      }
    }, 50);

    // Timeout after 4 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      if (window.google?.accounts?.oauth2) {
        return resolve();
      }
    }, 4000);

    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load GIS script')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

/**
 * Signs in using Google Identity Services (GIS) OAuth Token Client.
 * This works natively on any domain (local, preview, production, custom domain, Vercel)
 * without needing Firebase Auth Authorized Domain whitelist!
 */
export async function signInWithGoogleIdentity(): Promise<AuthSession> {
  await loadGoogleIdentityScript();

  if (!window.google?.accounts?.oauth2) {
    throw new Error('تعذر تحميل واجهة تسجيل الدخول من Google');
  }

  const clientId = firebaseConfig.oAuthClientId;
  if (!clientId) {
    throw new Error('معرف OAuth Client ID غير متوفر في إعدادات النظام');
  }

  return new Promise<AuthSession>((resolve, reject) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            console.error('Google token error:', tokenResponse);
            return reject(new Error(tokenResponse.error_description || tokenResponse.error || 'فشل الاتصال بحساب Google'));
          }

          const accessToken = tokenResponse.access_token;
          if (!accessToken) {
            return reject(new Error('لم يتم استلام رمز التحقق من Google'));
          }

          // Save token for Drive API calls
          setGoogleAccessToken(accessToken);

          try {
            // Fetch user info from Google userinfo endpoint using the access token
            const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            });

            let name = 'مستخدم Google';
            let email = 'user@gmail.com';
            let picture: string | undefined = undefined;

            if (userInfoRes.ok) {
              const userInfo = await userInfoRes.json();
              name = userInfo.name || userInfo.email?.split('@')[0] || name;
              email = userInfo.email || email;
              picture = userInfo.picture;
            }

            // Register or activate isolated company tenant for this Google user
            const tenant = registerCompany({
              name: `منشأة ${name}`,
              adminName: name,
              adminUsername: email,
              currency: 'ج.م',
              isGoogle: true,
              googleEmail: email
            });
            setActiveTenantId(tenant.id);

            const appUser: AppUser = {
              id: `usr_g_${email.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 15)}`,
              name,
              username: email,
              role: 'مدير',
              active: true,
              lastLogin: new Date().toISOString()
            };

            const session: AuthSession = {
              user: appUser,
              isGoogle: true,
              googleEmail: email,
              googlePhoto: picture,
              token: accessToken,
              tenantId: tenant.id,
              companyName: tenant.name
            };

            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(session));
            resolve(session);
          } catch (fetchErr) {
            console.warn('Could not fetch user profile details:', fetchErr);
            const fallbackTenant = registerCompany({
              name: 'منشأة سحابية جديدة',
              adminName: 'مستخدم جوجل',
              adminUsername: 'google_user',
              currency: 'ج.م',
              isGoogle: true
            });
            setActiveTenantId(fallbackTenant.id);

            const fallbackUser: AppUser = {
              id: `usr_g_${Date.now().toString(36)}`,
              name: 'مستخدم جوجل المسجل',
              username: 'google_user',
              role: 'مدير',
              active: true,
              lastLogin: new Date().toISOString()
            };
            const session: AuthSession = {
              user: fallbackUser,
              isGoogle: true,
              token: accessToken,
              tenantId: fallbackTenant.id,
              companyName: fallbackTenant.name
            };
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(session));
            resolve(session);
          }
        },
        error_callback: (err: any) => {
          if (err?.type === 'popup_closed' || err?.type === 'popup_blocked_by_browser') {
            reject(new Error('popup_closed'));
            return;
          }
          console.warn('Google Identity notification:', err?.type || err);
          reject(new Error(err?.message || 'تعذر استكمال تسجيل الدخول'));
        }
      });

      // Force account selector so the user can select ANY Gmail on their device
      client.requestAccessToken({ prompt: 'select_account' });
    } catch (e: any) {
      reject(e);
    }
  });
}

/**
 * Connects / Authorizes Google Drive for the current user and company
 * WITHOUT resetting the company or switching tenants!
 * Allows user to pick ANY Google account on their device.
 */
export async function connectGoogleDriveAccount(): Promise<{ token: string; email?: string; name?: string }> {
  await loadGoogleIdentityScript();

  if (!window.google?.accounts?.oauth2) {
    throw new Error('تعذر تحميل واجهة تسجيل الدخول من Google');
  }

  const clientId = firebaseConfig.oAuthClientId;
  if (!clientId) {
    throw new Error('معرف OAuth Client ID غير متوفر في إعدادات النظام');
  }

  return new Promise<{ token: string; email?: string; name?: string }>((resolve, reject) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            console.error('Google token error:', tokenResponse);
            return reject(new Error(tokenResponse.error_description || tokenResponse.error || 'فشل الاتصال بحساب Google'));
          }

          const accessToken = tokenResponse.access_token;
          if (!accessToken) {
            return reject(new Error('لم يتم استلام رمز التحقق من Google'));
          }

          setGoogleAccessToken(accessToken);

          let email: string | undefined;
          let name: string | undefined;
          let picture: string | undefined;

          try {
            const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (userInfoRes.ok) {
              const info = await userInfoRes.json();
              email = info.email;
              name = info.name;
              picture = info.picture;
            }
          } catch (err) {
            console.warn('Could not fetch user profile details:', err);
          }

          // Link to existing session without touching tenant isolation
          const currentRaw = localStorage.getItem(AUTH_USER_KEY);
          if (currentRaw) {
            try {
              const currentSession: AuthSession = JSON.parse(currentRaw);
              currentSession.token = accessToken;
              if (email) currentSession.googleEmail = email;
              if (picture) currentSession.googlePhoto = picture;
              currentSession.isGoogleLinked = true;
              localStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentSession));
            } catch (e) {}
          }

          // Link Google email to active company
          const activeTenantId = getActiveTenantId();
          if (activeTenantId && email) {
            updateCompany(activeTenantId, { googleEmail: email });
          }

          resolve({ token: accessToken, email, name });
        },
        error_callback: (err: any) => {
          if (err?.type === 'popup_closed' || err?.type === 'popup_blocked_by_browser') {
            reject(new Error('popup_closed'));
            return;
          }
          reject(new Error(err?.message || 'تعذر استكمال الاتصال بحساب Google'));
        }
      });

      client.requestAccessToken({ prompt: 'select_account' });
    } catch (e: any) {
      reject(e);
    }
  });
}
