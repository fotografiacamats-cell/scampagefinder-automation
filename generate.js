// Refresh a small batch of cached technical reports each day.
// Automated snapshots are utility pages, not editorial reviews or safety verdicts.
const fs = require('node:fs');
const path = require('node:path');

const API_BASE = 'https://scampagefinder-api.fotografiacamats.workers.dev/?domain=';
const BATCH_SIZE = 10;
const DELAY_MS = 350;
const OUTPUT_DIR = 'output';
const CURSOR_FILE = '.report-cursor';
const BASE_URL = 'https://reports.scampagefinder.com';

const domains = fs.readFileSync('domains.txt', 'utf8')
  .split(/\r?\n/)
  .map((domain) => domain.trim().toLowerCase())
  .filter(Boolean);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function formatList(values) {
  return Array.isArray(values) && values.length
    ? values.map(escapeHtml).join(', ')
    : 'Not detected';
}

function buildReport(domain, data) {
  const score = data.transparency_index?.score;
  const scoreText = Number.isFinite(score) ? escapeHtml(score) + '/100' : 'Unavailable';
  const info = data.domain_info || {};
  const dns = data.dns_records || {};
  const email = data.email_security || {};
  const web = data.web_security || {};
  const observedAt = data.observed_at ? escapeHtml(data.observed_at) : 'Not provided';
  const canonical = BASE_URL + '/check/' + encodeURIComponent(domain);

  const rows = [
    ['Registration date', info.created_at || 'Not available'],
    ['Registrar', info.registrar || 'Not available'],
    ['Domain age', Number.isFinite(info.age_days) ? info.age_days + ' days' : 'Not available'],
    ['A records', formatList(dns.a)],
    ['AAAA records', formatList(dns.aaaa)],
    ['MX records', formatList(dns.mx)],
    ['Name servers', formatList(dns.ns)],
    ['SPF record', email.spf?.detected ? 'Detected' : 'Not detected'],
    ['DMARC record', email.dmarc?.detected ? 'Detected' : 'Not detected'],
    ['HSTS header', web.hsts ? 'Detected' : 'Not detected'],
    ['Content Security Policy', web.csp ? 'Detected' : 'Not detected'],
    ['X-Frame-Options', web.xFrameOptions ? 'Detected' : 'Not detected'],
    ['X-Content-Type-Options', web.xContentType ? 'Detected' : 'Not detected']
  ];
  const tableRows = rows.map(([label, value]) =>
    '<tr><th scope="row">' + escapeHtml(label) + '</th><td>' + escapeHtml(value) + '</td></tr>'
  ).join('\n');

  return '<!doctype html>\n' +
    '<html lang="en"><head>\n' +
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<meta name="robots" content="noindex,follow">\n' +
    '<title>Technical data for ' + escapeHtml(domain) + ' | ScamPageFinder</title>\n' +
    '<meta name="description" content="Publicly observable domain, DNS, email authentication, and web security data for ' + escapeHtml(domain) + '.">\n' +
    '<link rel="canonical" href="' + escapeHtml(canonical) + '">\n' +
    '<style>body{font:16px/1.6 system-ui,sans-serif;max-width:850px;margin:3rem auto;padding:0 1rem;color:#172033}h1{line-height:1.2}p{color:#4b5563}.score{font-size:1.5rem;font-weight:700}table{width:100%;border-collapse:collapse;margin:1.5rem 0}th,td{text-align:left;padding:.65rem;border-bottom:1px solid #ddd}th{width:38%}.notice{background:#f3f4f6;padding:1rem;border-radius:.5rem;font-size:.95rem}a{color:#3730a3}</style>\n' +
    '</head><body>\n' +
    '<p><a href="https://scampagefinder.com/">ScamPageFinder</a> / Technical report</p>\n' +
    '<h1>Public technical data for ' + escapeHtml(domain) + '</h1>\n' +
    '<p>This cached report lists selected technical signals observed for the domain. It does not assess the operator, products, business practices, or whether a purchase is safe.</p>\n' +
    '<p class="score">Technical configuration score: ' + scoreText + '</p>\n' +
    '<table><tbody>' + tableRows + '</tbody></table>\n' +
    '<p>Observed at: <time>' + observedAt + '</time></p>\n' +
    '<p><a href="https://scampagefinder.com/check/' + escapeHtml(domain) + '">Run a fresh live check</a></p>\n' +
    '<aside class="notice">Technical signals have limits. HTTPS, domain age, DNS, SPF, DMARC, and security headers cannot establish whether a site is legitimate or guarantee that it is safe. Verify independently before sharing personal or payment information.</aside>\n' +
    '</body></html>\n';
}

async function main() {
  if (!domains.length) throw new Error('domains.txt contains no domains.');
  if (domains.some((domain) => !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain))) {
    throw new Error('domains.txt contains an invalid domain.');
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const rawCursor = Number.parseInt(fs.existsSync(CURSOR_FILE) ? fs.readFileSync(CURSOR_FILE, 'utf8') : '0', 10);
  const start = Number.isFinite(rawCursor) && rawCursor >= 0 ? rawCursor % domains.length : 0;
  const count = Math.min(BATCH_SIZE, domains.length);
  const batch = Array.from({ length: count }, (_, index) => domains[(start + index) % domains.length]);

  fs.writeFileSync(path.join(OUTPUT_DIR, '_redirects'), '/check/* /:splat 200\n');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  // Keep the sitemap valid but empty: cached automated reports are noindex utility pages.
  fs.writeFileSync(path.join(OUTPUT_DIR, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n');

  let generated = 0;
  let errors = 0;
  for (const domain of batch) {
    try {
      console.log('Refreshing ' + domain + '...');
      const response = await fetch(API_BASE + encodeURIComponent(domain), { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('API returned HTTP ' + response.status);
      const data = await response.json();
      if (data.success === false || !data.domain) throw new Error('API returned an invalid report');
      const temporaryPath = path.join(OUTPUT_DIR, domain + '.html.tmp');
      fs.writeFileSync(temporaryPath, buildReport(domain, data));
      fs.renameSync(temporaryPath, path.join(OUTPUT_DIR, domain + '.html'));
      generated++;
    } catch (error) {
      errors++;
      console.error('Could not refresh ' + domain + ': ' + error.message);
    }
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  if (errors === batch.length) throw new Error('Every report in this batch failed; cursor was not advanced.');
  fs.writeFileSync(CURSOR_FILE, String((start + count) % domains.length) + '\n');
  console.log('Completed: ' + generated + ' refreshed, ' + errors + ' errors; next cursor ' + ((start + count) % domains.length) + '.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
