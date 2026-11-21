# 0012 Mail delivery is a replaceable transport

Date: 2026-11-21. Status: accepted. Replaces "email is Cloudflare-only and
local mode has no email".

## Decision

Sending goes through one interface with three choices: Cloudflare Email
Sending (the default on Cloudflare), generic SMTP, or Off. With no method
configured the whole mail feature is off and the subscribe form is hidden.
Local mode is Off by default and can send once the user configures SMTP.

There are two edition emails, daily and weekly; each subscriber chooses one.
All edition emails go out at one moment: a time of day in the site's time
zone, kept as a setting. The default is 08:00, Asia/Tokyo. Emails are written
with React Email and rendered and sent by `apps/pipeline`. Hand-written emails
must use one of the shipped templates. An address that bounces three times in
a row stops receiving mail.

The list, tokens, preferences and bounce records live in the private database.
Credentials are secrets or config-file values, never rows in `settings`.

## Why

Self-hosters must be able to pick their own mail service, and the list must
not be locked into a provider.

## Consequence

Changing the transport needs no migration of the list. Summaries published as
unverified still stay out of every email (0006).
