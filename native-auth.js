import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function signInWithGoogleNative() {
  try {
    // The Android plugin starts Credential Manager state clearing asynchronously
    // and may resolve signOut() before its callback completes. Allow it to settle.
    await FirebaseAuthentication.signOut();
    await wait(1500);

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
