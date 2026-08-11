# EventFlow Hub

You are the architect and full-stack engineer for EventHub—a multi-tenant event calendar platform designed to be colorful, interactive, and sold as a packagable SaaS product.

**Full Product Scope:**
- Event calendar with month/week/day views, drag-drop event rescheduling (Outlook/Google Calendar UX)
- Gamification & competition mechanics
- Event sharing & social features
- Sponsored content system with billing (event coordinators buy ad space, or system sells to local businesses)
- Multi-tenant with RLS (Role-Level Security) for event coordinators
- Admin dashboard: user/event moderation, bans, sponsored content/advertising management, analytics
- Auto-approve events; manual removal via one-click in admin (rule violation)
- Production logging on all schema/database changes
- Packagable deliverable (database schema + code structure)

**Phase 0: Architecture & Data Model**

Start by designing the complete database schema (Supabase PostgreSQL):

1. **Core Tables:**
   - `users` (event coordinators, admins, regular users) – id, email, auth_user_id, role, profile, created_at, updated_at
   - `events` (calendar events) – id, coordinator_id, title, description, start_time, end_time, location, status (draft/approved/removed), created_at, updated_at
   - `event_details` (header graphics, landscape images, portrait images, metadata) – id, event_id, logo_url, header_image_url, landscape_images (JSON array), portrait_images (JSON array)
   - `sponsored_slots` (ad slots within an event) – id, event_id, slot_position, slot_type, cost, status (available/sold/filled), created_at, updated_at
   - `sponsors` (businesses that buy ad space) – id, event_id, sponsored_slot_id, business_name, logo_url, description, link, payment_status
   - `billing` (transactions for sponsored content) – id, sponsor_id, event_id, amount, status (pending/paid/refunded), payment_method, created_at
   - `admin_audit_log` (all schema/data changes) – id, user_id, action, table_name, record_id, change_details, created_at
   - `bans` (user/event restrictions) – id, banned_user_id, banned_event_id, reason, created_by_admin_id, created_at, expires_at

2. **RLS Policies:**
   - Event coordinators can only see/edit their own events
   - Coordinators can manage sponsored slots for their events
   - Admins can see all users, events, bans, audit logs
   - Regular users can view public events

3. **Billing Model:**
   - Event coordinators can toggle sponsored content on/off (if off, monthly fee applied)
   - Sponsored slots have configurable pricing
   - System can also sell ad space to external businesses (separate pricing tier)

4. **Admin Controls:**
   - User ban/restrict (temp or permanent)
   - Event removal (one-click, with audit log)
   - Sponsored content dashboard (revenue, fill rate, active sponsors)
   - Analytics (events created, user growth, revenue trends)

5. **Production Logging:**
   - All schema migrations logged
   - All payment transactions logged
   - All admin actions (bans, removals) logged
   - All sponsored content changes logged

**Output for Phase 0:**
1. Complete database schema (SQL DDL) with comments
2. Detailed RLS policy rules (pseudocode or SQL)
3. API endpoint spec (auth, events CRUD, sponsorships, billing, admin)
4. Admin dashboard feature list
5. Database versioning strategy (schema_version table or migration log)

**Critical Reminders:**
- Keep database schema synchronized with every iteration
- Log every production change
- Check your work: validate schema relationships, FK constraints, RLS coverage
- Assume all implications for admin controls and edge cases
- Design for multi-tenant isolation from day one

Start with schema design. Show the full DDL, then walk through RLS policies, then outline the API surface and admin dashboard features.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://sparkle-calendar-co.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/daa508be-3750-4115-a773-1ec0279316d8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
