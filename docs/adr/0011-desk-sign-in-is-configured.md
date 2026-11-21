# 0011 Desk sign-in is a configured method

Date: 2026-11-21. Status: accepted. Replaces "the admin is protected by
Cloudflare Access; local mode listens on localhost only".

## Decision

How the desk (the admin interface) is protected is configuration, one of four:
this machine only (the local default), password, Cloudflare Access, or a
sign-in proxy. No method is hard-wired. With a password, five failures pause
sign-in for 15 minutes; there is no recovery by email, the password lives in
the config file.

## Why

A self-hoster may run on Cloudflare without Access, or off Cloudflare
entirely. Tying the desk to one product would break invariant 8.

## Consequence

Every desk action is still audited, and writes still go to `apps/pipeline`.
