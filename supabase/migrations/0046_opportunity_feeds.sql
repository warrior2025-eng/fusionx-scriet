-- Opportunity feeds (no new tables). Devpost, Unstop and Devfolio are now read from their free public JSON feeds
-- (lib/autopilot/feeds.ts), so their HTML pages are skipped by the morning job. This migration only switches off
-- one source: tryst-iitd.org no longer belongs to the IIT Delhi fest (checked 15 Nov 2026: it now shows an
-- unrelated gambling site), so it must never be read or linked. Safe to run more than once.
update opportunity_sources set active = false, last_result = 'switched off: the domain no longer belongs to the fest'
where url ilike '%tryst-iitd.org%' and active;
