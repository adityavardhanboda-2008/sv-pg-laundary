SV PG Laundry v2
Features: choose Mess Building (left/right machines), Old Building (2nd/3rd floor), or New Building (single machine); live machine state; queue and estimated wait using 90-minute average.

Before sharing:
1. Firebase Authentication > Sign-in method: enable Google.
2. Authentication > Settings > Authorized domains: add the GitHub Pages domain.
3. Realtime Database Rules must permit authenticated residents to read/write machines and queues. Never enable public unauthenticated read/write. Starter rules for authenticated-only access (tighten to an approved resident list before sharing widely):
{
  "rules": {
    "machines": { ".read": "auth != null", "$machine": { ".write": "auth != null" } },
    "queues": { ".read": "auth != null", "$machine": { ".write": "auth != null" } }
  }
}
These starter rules allow any Google-authenticated account to manage machines. Restrict to PG residents before launch.
4. Upload these files to the repository root, then Settings > Pages > Deploy from branch > main > /(root).
5. PWA service worker works only over HTTPS/localhost. Google sign-in needs hosted HTTPS, not file://.
6. Queue ETA is an estimate; wash times vary. The 90-minute timeout reset runs when an app client is connected or next opens; strict background reset needs a trusted scheduled backend.
