import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

export async function signInWithGoogleNative() {
  // Clear any stale native Google session before starting a fresh account selection.
  await FirebaseAuthentication.signOut();
  return FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
}


export async function signOutGoogleNative() {
  return FirebaseAuthentication.signOut();
}
