# 0009 Share cards are drawn on first request

Date: 2026-11-21. Status: accepted. Supersedes the "generate share image" part
of the publish step in the original design.

## Decision

A share card is drawn the first time it is requested, then stored under `og/`.
A later request reads storage first; the card is redrawn and overwritten when
the stored file is missing or older than the latest scan. There is one file
per topic, language and orientation (landscape 1200x630, tall 1080x1920), plus
three site-level cards per language.

`apps/web` stays read-only. On a miss it asks `apps/pipeline` over the service
binding to draw and store the image. The publish step only purges caches.

## Why

Drawing every card after every scan stores images nobody asks for, and the
count grows with every topic and language. Drawing on request costs one slow
first response per card.

## Consequence

Local mode and Cloudflare use the same logic, with no setting. The service
binding carries one more method (see 0010).
