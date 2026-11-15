-- Run ONCE in the Supabase SQL Editor (same as supabase/migrations/0046_opportunity_feeds.sql). Safe to run again.
begin;
update opportunity_sources set active = false, last_result = 'switched off: the domain no longer belongs to the fest'
where url ilike '%tryst-iitd.org%' and active;
commit;
-- Check: select name, active, last_result from opportunity_sources order by name;
