-- The WhatsApp community link, set in Admin → Settings next to Instagram and LinkedIn.
-- Empty means the site uses the built-in link (lib/site-config.ts).

alter table organization_settings add column if not exists whatsapp_url text;
