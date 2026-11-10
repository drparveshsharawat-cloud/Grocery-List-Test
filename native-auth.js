import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

export async function signInWithGoogleNative() {
  return FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
}


export async function signOutGoogleNative() {
  return FirebaseAuthentication.signOut();
}
