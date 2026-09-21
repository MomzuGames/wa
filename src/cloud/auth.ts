import { isSignInWithEmailLink, onAuthStateChanged, sendSignInLinkToEmail, signInWithEmailLink, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';

const EMAIL_KEY = 'chowa.signin.email';

export type AuthListener = (user: User | null) => void;

// Passwordless sign-in: the player gets a link by email. Opening it (or pasting it
// into the app) completes the sign-in. No passwords exist anywhere.
export async function requestSignInLink(email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  await sendSignInLinkToEmail(auth(), clean, {
    url: `${location.origin}${location.pathname}`,
    handleCodeInApp: true,
  });
  try {
    localStorage.setItem(EMAIL_KEY, clean);
  } catch {
    // Storage may be blocked; the player can type the email again when completing.
  }
}

export function rememberedEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

export function isSignInLink(link: string): boolean {
  return isSignInWithEmailLink(auth(), link);
}

// Completes a sign-in from a link, whether it was opened here or pasted in from elsewhere.
export async function completeSignIn(link: string, email: string): Promise<User> {
  const result = await signInWithEmailLink(auth(), email.trim().toLowerCase(), link);
  try {
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    // ignore
  }
  return result.user;
}

// If the current page URL is a sign-in link, finish the sign-in and clean the address bar.
export async function completeSignInFromUrl(): Promise<User | null> {
  if (!isSignInLink(location.href)) return null;
  const email = rememberedEmail();
  if (!email) return null;
  try {
    const user = await completeSignIn(location.href, email);
    history.replaceState(null, '', `${location.origin}${location.pathname}`);
    return user;
  } catch {
    return null;
  }
}

export function watchAuth(listener: AuthListener): () => void {
  return onAuthStateChanged(auth(), listener);
}

export function currentUser(): User | null {
  return auth().currentUser;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth());
}
