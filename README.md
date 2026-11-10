# Family Grocery List — multi-family development

This branch introduces family-scoped grocery lists, email/password and Google sign-in, and email-restricted invitation links.

## Important deployment order

1. Review `firestore.rules` carefully. Do not publish until it has been tested in the Firebase Emulator or a non-production Firebase project.
2. Deploy the rules from this repository only after testing.
3. Host the web app over HTTPS (GitHub Pages is suitable).
4. Add the hosting domain in Firebase Authentication → Settings → Authorized domains.
5. Test with two separate Firebase accounts and verify that cross-family reads and writes are denied.

Invitation URLs contain a high-entropy, single-use token and a family ID locator. The invite document is readable only by the exact invited, verified email. Tokens expire after seven days.

## Legacy migration

The app includes an owner-only action that copies the existing `/items` collection into the currently selected family. It does not delete or modify legacy documents. The legacy rule is retained temporarily in `firestore.rules`; remove it after migration and testing.

## Current scope

The web/PWA client is the first milestone. A native Android package (APK) requires a separate Android wrapper/build pipeline and should follow successful web and security-rule testing.
