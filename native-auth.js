import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

export async function signInWithGoogleNative() {
  try {
    // Bypass Android Credential Manager because its cached-account
    // re-authentication path is returning "[16] Account reauth failed".
    // The plugin's legacy Google sign-in path remains supported.
    return await FirebaseAuthentication.signInWithGoogle({
      skipNativeAuth: true,
      useCredentialManager: false,
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
