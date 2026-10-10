-- Expand event_category from the original 7 values to 17. The original
-- taxonomy forced most real-world events into "other" (concerts, kids'
-- events, theater, food events, book clubs, free community meetups --
-- none of them fit sports/networking/education/social/fundraiser/
-- workshop), which weakened category-based discovery.
--
-- On its own file on purpose, same reason as 20260927110000: Postgres
-- refuses to USE an enum value in the same transaction that added it, and
-- each migration file is one transaction. Nothing elsewhere in this
-- migration references these new values.
--
-- This does NOT reclassify any existing "other" events into the new
-- categories -- that's a judgment call per event, not a mechanical
-- migration, and needs a human pass.
ALTER TYPE public.event_category ADD VALUE IF NOT EXISTS 'music';
ALTER TYPE public.event_category ADD VALUE IF NOT EXISTS 'family';
ALTER TYPE public.event_category ADD VALUE IF NOT EXISTS 'arts';
ALTER TYPE public.event_category ADD VALUE IF NOT EXISTS 'theater';
ALTER TYPE public.event_category ADD VALUE IF NOT EXISTS 'comedy';
ALTER TYPE public.event_category ADD VALUE IF NOT EXISTS 'food_drink';
ALTER TYPE public.event_category ADD VALUE IF NOT EXISTS 'community';
ALTER TYPE public.event_category ADD VALUE IF NOT EXISTS 'expo';
ALTER TYPE public.event_category ADD VALUE IF NOT EXISTS 'books';
ALTER TYPE public.event_category ADD VALUE IF NOT EXISTS 'free';
