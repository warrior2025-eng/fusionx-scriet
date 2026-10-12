/**
 * The one email the site sends: a notification, as it appears on the site,
 * with a button back to the page it is about. Pure functions.
 */

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** A notification's link, as a full address. Only the site's own paths are linked. */
export function absoluteLink(siteUrl: string, link: string | null): string | null {
  if (!link || !/^\/(?!\/)/.test(link)) return null;
  return `${siteUrl.replace(/\/$/, "")}${link}`;
}

export function notificationEmail(input: {
  siteName: string;
  siteUrl: string;
  name: string | null;
  title: string;
  body: string | null;
  link: string | null;
}): { subject: string; html: string; text: string } {
  const site = input.siteUrl.replace(/\/$/, "");
  const href = absoluteLink(site, input.link);
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 150);
  const body = (input.body ?? "").trim();
  const footer = `You are receiving this because you have an account on ${input.siteName}. All your notifications: ${site}/notifications`;

  const text = [title, body, href ? `Open: ${href}` : "", `--\n${footer}`].filter(Boolean).join("\n\n");

  // Navy, white and the logo blue; tables and inline styles, as email clients need.
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f1f5ff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5ff;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d9dfee;">
<tr><td style="padding:20px 28px;border-bottom:1px solid #d9dfee;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#0a1230;">${escape(input.siteName)}</td></tr>
<tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;color:#0a1230;">
<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;font-weight:bold;color:#0a1230;">${escape(title)}</h1>
${body ? `<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#4a5578;">${escape(body).replace(/\n/g, "<br>")}</p>` : ""}
${href ? `<a href="${escape(href)}" style="display:inline-block;background:#004df6;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:11px 20px;">Open on ${escape(input.siteName)}</a>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #d9dfee;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#5e6a8c;">You are receiving this because you have an account on ${escape(input.siteName)}. <a href="${escape(site)}/notifications" style="color:#004df6;">All your notifications</a></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject: title, html, text };
}
