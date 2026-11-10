import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

export async function signInWithGoogleNative() {
  try {
    // Clear any stale native Google session before starting a fresh account selection.
    await FirebaseAuthentication.signOut();

    // Use the legacy Android Google sign-in flow for this diagnostic test.
    return await FirebaseAuthentication.signInWithGoogle({
      skipNativeAuth: true,
      useCredentialManager: false,
    });
  } catch (error) {
    // Preserve the native error code and full message so the app can display
    // the actual failure instead of a truncated or unhelpful status.
    let details = '';
    try {
      details = JSON.stringify(error, Object.getOwnPropertyNames(error));
    } catch {
      details = String(error);
    }
    throw new Error(
      'Google sign-in diagnostic: code=' + (error?.code ?? 'not provided') +
      '; message=' + (error?.message ?? String(error)) +
      '; details=' + details
    );
  }
}

export async function signOutGoogleNative() {
  return FirebaseAuthentication.signOut();
}
