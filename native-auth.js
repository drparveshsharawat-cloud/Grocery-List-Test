import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

export async function signInWithGoogleNative() {
  try {
    // Clear any stale native Google session before starting a fresh account selection.
    await FirebaseAuthentication.signOut();

    // Use the plugin's default Android Google sign-in flow (Credential Manager).
    return await FirebaseAuthentication.signInWithGoogle({
      skipNativeAuth: true,
    });
  } catch (error) {
    // Preserve the native error code and full message for troubleshooting.
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
