import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

export async function signInWithGoogleNative() {
  // Clear any stale native Google session before starting a fresh account selection.
  await FirebaseAuthentication.signOut();
  // Use the plugin's legacy Android Google sign-in flow instead of Credential Manager.
  return FirebaseAuthentication.signInWithGoogle({
    skipNativeAuth: true,
    useCredentialManager: false,
  });
}

export async function signOutGoogleNative() {
  return FirebaseAuthentication.signOut();
}
