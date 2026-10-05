# Add the production migration copy

## What I’ll do

- Copy the already-applied social-feed migration, byte-for-byte, into `supabase/migrations/20261005231000_social_feed_ad_surface.sql`.
- Keep the generated migration in place so the current Lovable Cloud migration history remains intact.
- Compare both files to confirm their SQL is identical.
- Check the latest build result after the file is added.

## What you’ll need to do

- If you maintain a separate external production database, apply `supabase/migrations/20261005231000_social_feed_ad_surface.sql` there through your normal deployment process.
- If production uses this project’s Lovable Cloud backend, no manual database action is needed because the migration has already been applied.

## Technical note

The migration only extends sponsor tracking to accept the `feed` surface and raises the calendar campaign selection cap to 20 for fair rotation. It does not add tables, columns, or broader public access.
