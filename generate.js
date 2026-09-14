// generate.js - Genera informes HTML estáticos a partir de dominios
// v2.0 - Con contenido editorial, Schema.org, AdSense y enlazado interno
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://scampagefinder-api.fotografiacamats.workers.dev/?domain=';
const ADSENSE_CLIENT = 'ca-pub-7947218272068445';
const ADSENSE_SLOT = '2304486248';

const domains = fs.readFileSync('domains.txt', 'utf8')
    .split('\n')
    .map(d => d.trim())
    .filter(Boolean);

function escapeXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Interpreta el score y devuelve color, etiqueta y texto de riesgo
function getRiskProfile(score) {
    if (score >= 75) return {
        color: 'emerald',
        hex: '#10b981',
        label: 'Low Risk',
        badge: '✅ Low Risk',
        summary: `${score}/100 — This domain shows strong technical security signals. WHOIS data, email authentication, and HTTP security headers are properly configured.`,
        advice: 'This domain passes most technical security checks. Always verify independently before entering payment information on any unfamiliar site.'
    };
    if (score >= 45) return {
        color: 'amber',
        hex: '#f59e0b',
        label: 'Medium Risk',
        badge: '⚡ Medium Risk',
        summary: `${score}/100 — This domain has partial security configuration. Some technical signals are present but others are missing or weak.`,
        advice: 'Proceed with caution. Look for independent reviews on Trustpilot or Reddit before making a purchase, and prefer paying by credit card for chargeback protection.'
    };
    return {
        color: 'rose',
        hex: '#f43f5e',
        label: 'High Risk',
        badge: '⚠️ High Risk',
        summary: `${score}/100 — This domain shows multiple missing or weak security signals. This is a pattern commonly associated with short-lived or fraudulent websites.`,
        advice: 'Do not enter payment or personal data on this site without extensive independent verification. Consider using a VPN to protect your IP address while investigating.'
    };
}

// Interpreta la edad del dominio
function getDomainAgeText(ageDays) {
    if (ageDays === null || ageDays === undefined) return { text: 'Unknown', risk: 'neutral', flag: '' };
    if (ageDays < 90)  return { text: `${ageDays} days`, risk: 'high',    flag: '⚠️ Very new domain — high risk signal' };
    if (ageDays < 365) return { text: `${ageDays} days`, risk: 'medium',  flag: '⚡ Domain under 1 year old' };
    const years  = Math.floor(ageDays / 365);
    const months = Math.floor((ageDays % 365) / 30);
    const str = years + ' year' + (years > 1 ? 's' : '') + (months > 0 ? ', ' + months + ' month' + (months > 1 ? 's' : '') : '');
    return { text: str, risk: 'low', flag: '✅ Established domain' };
}

// Genera el bloque de Schema JSON-LD
function buildSchema(domain, score, risk, data) {
    const created = data.domain_info?.created_at ? data.domain_info.created_at.substring(0, 10) : null;
    return JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": `Is ${domain} safe? — Security Report`,
        "description": `Free security analysis of ${domain}: WHOIS age, DNS records, SPF, DMARC, and HTTP security headers. Technical Transparency Score: ${score}/100 (${risk.label}).`,
        "url": `https://reports.scampagefinder.com/check/${domain}`,
        "mainEntity": {
            "@type": "Review",
            "itemReviewed": {
                "@type": "WebSite",
                "name": domain,
                "url": `https://${domain}`
            },
            "reviewRating": {
                "@type": "Rating",
                "ratingValue": score,
                "bestRating": 100,
                "worstRating": 0
            },
            "author": { "@type": "Organization", "name": "ScamPageFinder" },
            "reviewBody": risk.summary
        },
        "publisher": { "@type": "Organization", "name": "ScamPageFinder", "url": "https://scampagefinder.com" },
        "dateModified": new Date().toISOString().split('T')[0]
    }, null, 2);
}

// Genera el bloque FAQ Schema
function buildFAQSchema(domain, score, risk, spf, dmarc, ageDays) {
    const ageInfo = getDomainAgeText(ageDays);
    return JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": `Is ${domain} safe?`,
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": `${domain} has a Technical Transparency Score of ${score}/100 (${risk.label}). ${risk.summary} ${risk.advice}`
                }
            },
            {
                "@type": "Question",
                "name": `How old is the domain ${domain}?`,
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": ageDays !== null ? `The domain ${domain} is ${ageInfo.text} old. ${ageInfo.flag}.` : `The registration date of ${domain} could not be determined from public WHOIS data.`
                }
            },
            {
                "@type": "Question",
                "name": `Does ${domain} have SPF and DMARC email authentication?`,
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": `SPF record: ${spf ? 'Detected' : 'Not detected'}. DMARC policy: ${dmarc ? 'Detected' : 'Not detected'}. ${!spf || !dmarc ? 'Missing email authentication records mean anyone could potentially send emails impersonating this domain.' : 'Both email authentication records are present, which is a positive signal for a legitimate domain.'}`
                }
            }
        ]
    }, null, 2);
}

// Genera el HTML completo del informe
function buildHTML(domain, data) {
    const score     = data.transparency_index?.score ?? 0;
    const status    = data.transparency_index?.label ?? 'Unknown';
    const breakdown = data.transparency_index?.breakdown ?? [];
    const risk      = getRiskProfile(score);

    const info      = data.domain_info ?? {};
    const dns       = data.dns_records ?? {};
    const email     = data.email_security ?? {};
    const web       = data.web_security ?? {};

    const spf       = email.spf?.detected ?? false;
    const dmarc     = email.dmarc?.detected ?? false;
    const hsts      = web.hsts ?? false;
    const csp       = web.csp ?? false;
    const xframe    = web.xFrameOptions ?? false;
    const nosniff   = web.xContentType ?? false;

    const ageDays   = info.age_days ?? null;
    const ageInfo   = getDomainAgeText(ageDays);
    const registrar = escapeHtml(info.registrar ?? 'Unknown');
    const created   = info.created_at ? info.created_at.substring(0, 10) : 'Unknown';
    const expires   = info.expires_at  ? info.expires_at.substring(0, 10)  : 'Unknown';
    const privacy   = info.privacy_protected ? 'Active (GDPR proxy)' : 'Not detected';

    const aRecords  = dns.a?.length  ? dns.a.join(', ')  : 'None';
    const mxRecords = dns.mx?.length ? `${dns.mx.length} configured` : 'None';
    const nsRecords = dns.ns?.length ? dns.ns.join(', ') : 'Unknown';

    const today = new Date().toISOString().split('T')[0];

    const check = (val) => val
        ? `<span style="color:#10b981;font-weight:700">✓ Detected</span>`
        : `<span style="color:#6b7280;font-weight:700">✗ Not detected</span>`;

    const breakdownRows = breakdown.map(b =>
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:4px;font-size:12px">
            <span style="color:#cbd5e1">${escapeHtml(b.item)}</span>
            <span style="color:#10b981;font-weight:700">+${b.pts}</span>
        </div>`
    ).join('');

    const schemaJson    = buildSchema(domain, score, risk, data);
    const faqSchemaJson = buildFAQSchema(domain, score, risk, spf, dmarc, ageDays);

    const colorMap = { emerald: '#10b981', amber: '#f59e0b', rose: '#f43f5e' };
    const scoreColor = colorMap[risk.color];

    // Dominio de tld para texto editorial
    const domainParts = domain.split('.');
    const tld = domainParts[domainParts.length - 1].toUpperCase();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Is ${escapeHtml(domain)} safe? — Security Report | ScamPageFinder</title>
<meta name="description" content="Free security analysis of ${escapeHtml(domain)}: WHOIS age, DNS, SPF, DMARC, and security headers. Technical Transparency Score: ${score}/100. Is ${escapeHtml(domain)} a scam?">
<link rel="canonical" href="https://reports.scampagefinder.com/check/${escapeXml(domain)}">
<link rel="icon" href="https://scampagefinder.com/logo.png" type="image/png">
<meta property="og:type" content="website">
<meta property="og:title" content="Is ${escapeHtml(domain)} safe? Score: ${score}/100 — ScamPageFinder">
<meta property="og:description" content="${escapeHtml(risk.summary)}">
<meta property="og:url" content="https://reports.scampagefinder.com/check/${escapeXml(domain)}">
<meta property="og:image" content="https://scampagefinder.com/logo.png">
<meta name="twitter:card" content="summary">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>
<script type="application/ld+json">${schemaJson}</script>
<script type="application/ld+json">${faqSchemaJson}</script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}
  a{color:#818cf8;text-decoration:none}a:hover{text-decoration:underline}
  .wrap{max-width:780px;margin:0 auto;padding:0 16px}
  header{background:#1e293b;border-bottom:1px solid #334155;padding:14px 0;position:sticky;top:0;z-index:50}
  header .inner{max-width:1100px;margin:0 auto;padding:0 20px;display:flex;justify-content:space-between;align-items:center}
  .logo{font-size:18px;font-weight:800;color:#818cf8;display:flex;align-items:center;gap:8px}
  .logo img{height:28px}
  .cta-btn{background:#4f46e5;color:#fff;padding:8px 18px;border-radius:10px;font-size:12px;font-weight:700;transition:background 0.2s}
  .cta-btn:hover{background:#4338ca;text-decoration:none}
  main{padding:32px 0 48px}
  h1{font-size:26px;font-weight:800;color:#f1f5f9;margin-bottom:8px;line-height:1.3}
  h2{font-size:17px;font-weight:700;color:#f1f5f9;margin-bottom:12px}
  h3{font-size:14px;font-weight:700;color:#cbd5e1;margin-bottom:8px}
  .card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:20px;margin-bottom:16px}
  .score-hero{display:flex;flex-direction:column;gap:12px}
  @media(min-width:500px){.score-hero{flex-direction:row;align-items:center;justify-content:space-between}}
  .score-number{font-size:52px;font-weight:900;line-height:1}
  .score-label{font-size:13px;color:#94a3b8;margin-top:4px}
  .risk-badge{display:inline-block;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;margin-bottom:8px}
  .grid2{display:grid;grid-template-columns:1fr;gap:12px}
  @media(min-width:560px){.grid2{grid-template-columns:1fr 1fr}}
  .row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(51,65,85,0.5);font-size:12px}
  .row:last-child{border-bottom:none}
  .row-label{color:#94a3b8}
  .row-val{font-weight:600;color:#e2e8f0;text-align:right;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .check-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
  @media(min-width:400px){.check-grid{grid-template-columns:repeat(4,1fr)}}
  .check-item{background:rgba(255,255,255,0.03);border:1px solid #334155;border-radius:10px;padding:10px;text-align:center}
  .check-item .check-name{font-size:10px;color:#64748b;display:block;margin-bottom:4px}
  .ad-wrap{background:rgba(255,255,255,0.02);border:1px solid #1e293b;border-radius:12px;overflow:hidden;margin:16px 0;min-height:90px;display:flex;align-items:center;justify-content:center}
  .prose p{color:#94a3b8;font-size:13px;line-height:1.7;margin-bottom:10px}
  .prose p:last-child{margin-bottom:0}
  .alert{padding:14px 16px;border-radius:12px;font-size:12px;line-height:1.6;margin-bottom:16px}
  .faq-item{background:rgba(255,255,255,0.02);border:1px solid #334155;border-radius:12px;padding:14px;margin-bottom:8px}
  .faq-q{font-weight:700;color:#e2e8f0;font-size:13px;margin-bottom:4px}
  .faq-a{color:#94a3b8;font-size:12px;line-height:1.6}
  .related-grid{display:grid;grid-template-columns:1fr;gap:8px}
  @media(min-width:500px){.related-grid{grid-template-columns:1fr 1fr}}
  .related-link{background:rgba(255,255,255,0.03);border:1px solid #334155;border-radius:12px;padding:12px 14px;display:block;color:#818cf8;font-size:12px;font-weight:600;transition:background 0.2s}
  .related-link:hover{background:rgba(79,70,229,0.1);text-decoration:none}
  .related-link span{display:block;color:#64748b;font-weight:400;margin-top:2px;font-size:11px}
  .nordvpn-cta{background:linear-gradient(135deg,rgba(79,70,229,0.2),rgba(99,102,241,0.1));border:1px solid rgba(79,70,229,0.4);border-radius:16px;padding:24px;text-align:center;margin:16px 0}
  .nordvpn-cta h3{color:#c7d2fe;font-size:15px;margin-bottom:6px}
  .nordvpn-cta p{color:#94a3b8;font-size:12px;margin-bottom:14px}
  .nordvpn-btn{display:inline-block;background:#4f46e5;color:#fff;padding:10px 24px;border-radius:10px;font-size:13px;font-weight:700;transition:background 0.2s}
  .nordvpn-btn:hover{background:#4338ca;text-decoration:none}
  footer{border-top:1px solid #1e293b;padding:28px 0;text-align:center;color:#475569;font-size:11px}
  footer .footer-links{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-bottom:10px}
  footer a{color:#64748b}footer a:hover{color:#818cf8}
  .tag{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#818cf8;margin-bottom:8px;display:block}
</style>
</head>
<body>

<header>
  <div class="inner">
    <a href="https://scampagefinder.com" class="logo">
      <img src="https://scampagefinder.com/logo.png" alt="ScamPageFinder">
      ScamPageFinder
    </a>
    <a href="https://scampagefinder.com/go/protection" class="cta-btn">🔒 Protect Your Privacy</a>
  </div>
</header>

<main>
<div class="wrap">

  <!-- Breadcrumb -->
  <p style="font-size:11px;color:#475569;margin-bottom:16px">
    <a href="https://scampagefinder.com">ScamPageFinder</a> › Security Reports › ${escapeHtml(domain)}
  </p>

  <!-- Título -->
  <span class="tag">Security Report · ${today}</span>
  <h1>Is ${escapeHtml(domain)} Safe?</h1>
  <p style="color:#94a3b8;font-size:13px;margin-bottom:20px">
    Automated technical analysis using public WHOIS, DNS, SPF, DMARC, and HTTP security header data.
    <a href="https://scampagefinder.com/check/${escapeHtml(domain)}">Run a fresh live scan →</a>
  </p>

  <!-- Score hero -->
  <div class="card" style="margin-bottom:16px">
    <div class="score-hero">
      <div>
        <span class="tag">Technical Transparency Score</span>
        <div class="score-number" style="color:${scoreColor}">${score}<span style="font-size:24px;color:#475569">/100</span></div>
        <div class="score-label">${status}</div>
      </div>
      <div style="text-align:right">
        <div class="risk-badge" style="background:${scoreColor}22;color:${scoreColor};border:1px solid ${scoreColor}44">${risk.badge}</div>
        <p style="color:#94a3b8;font-size:11px;max-width:280px;line-height:1.5">${risk.summary}</p>
      </div>
    </div>
    ${breakdownRows ? `<div style="margin-top:14px;padding-top:14px;border-top:1px solid #334155"><h3 style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Score breakdown</h3>${breakdownRows}</div>` : ''}
  </div>

  <!-- Risk alert -->
  <div class="alert" style="background:${scoreColor}11;border:1px solid ${scoreColor}33;color:#e2e8f0">
    <strong style="color:${scoreColor}">${risk.badge}</strong><br>
    ${risk.advice}
  </div>

  <!-- AdSense 1 -->
  <div class="ad-wrap">
    <ins class="adsbygoogle" style="display:block;width:100%" data-ad-client="${ADSENSE_CLIENT}" data-ad-slot="${ADSENSE_SLOT}" data-ad-format="auto" data-full-width-responsive="true"></ins>
    <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
  </div>

  <!-- Domain info + DNS -->
  <div class="grid2">
    <div class="card">
      <h2>📅 Domain & WHOIS</h2>
      <div class="row"><span class="row-label">Registration date</span><span class="row-val">${created}</span></div>
      <div class="row"><span class="row-label">Domain age</span><span class="row-val" style="color:${ageDays < 90 ? '#f43f5e' : ageDays < 365 ? '#f59e0b' : '#10b981'}">${ageInfo.text}</span></div>
      <div class="row"><span class="row-label">Expiry date</span><span class="row-val">${expires}</span></div>
      <div class="row"><span class="row-label">Registrar</span><span class="row-val">${registrar}</span></div>
      <div class="row"><span class="row-label">Privacy protection</span><span class="row-val">${privacy}</span></div>
      ${ageDays !== null ? `<div style="margin-top:10px;padding:8px 10px;background:rgba(255,255,255,0.03);border-radius:8px;font-size:11px;color:#94a3b8">${ageInfo.flag}</div>` : ''}
    </div>
    <div class="card">
      <h2>🌐 DNS Records</h2>
      <div class="row"><span class="row-label">A records (IPv4)</span><span class="row-val">${escapeHtml(aRecords)}</span></div>
      <div class="row"><span class="row-label">MX mail servers</span><span class="row-val">${escapeHtml(mxRecords)}</span></div>
      <div class="row"><span class="row-label">Name servers</span><span class="row-val">${escapeHtml(nsRecords)}</span></div>
    </div>
  </div>

  <!-- Email auth -->
  <div class="card">
    <h2>✉️ Email Authentication</h2>
    <div class="grid2">
      <div style="background:rgba(255,255,255,0.03);border:1px solid #334155;border-radius:12px;padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-weight:700;color:#e2e8f0;font-size:13px">SPF Record</span>
          ${check(spf)}
        </div>
        <p style="font-size:11px;color:#64748b">Specifies which mail servers are authorized to send email from this domain. Prevents basic email spoofing.</p>
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid #334155;border-radius:12px;padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-weight:700;color:#e2e8f0;font-size:13px">DMARC Policy</span>
          ${check(dmarc)}
        </div>
        <p style="font-size:11px;color:#64748b">Enforces SPF and DKIM alignment to block phishing emails that impersonate this domain.</p>
      </div>
    </div>
    ${(!spf || !dmarc) ? `<div style="margin-top:12px;padding:10px 12px;background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.2);border-radius:10px;font-size:11px;color:#fda4af">⚠️ Missing email authentication records mean this domain could potentially be impersonated in phishing emails. Legitimate established businesses almost always configure both SPF and DMARC.</div>` : `<div style="margin-top:12px;padding:10px 12px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:10px;font-size:11px;color:#6ee7b7">✓ Both SPF and DMARC are configured. This is a positive signal — the domain owner has invested in email security.</div>`}
  </div>

  <!-- Security headers -->
  <div class="card">
    <h2>🔒 HTTP Security Headers</h2>
    <div class="check-grid">
      <div class="check-item"><span class="check-name">HSTS</span>${check(hsts)}</div>
      <div class="check-item"><span class="check-name">CSP</span>${check(csp)}</div>
      <div class="check-item"><span class="check-name">X-Frame-Options</span>${check(xframe)}</div>
      <div class="check-item"><span class="check-name">MIME Sniffing</span>${check(nosniff)}</div>
    </div>
    <p style="font-size:11px;color:#64748b;margin-top:10px">Security headers require active developer implementation. Their presence signals a security-conscious operation; their absence is a risk indicator for any site handling payments or login credentials.</p>
  </div>

  <!-- AdSense 2 -->
  <div class="ad-wrap">
    <ins class="adsbygoogle" style="display:block;width:100%" data-ad-client="${ADSENSE_CLIENT}" data-ad-slot="${ADSENSE_SLOT}" data-ad-format="auto" data-full-width-responsive="true"></ins>
    <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
  </div>

  <!-- Contenido editorial -->
  <div class="card prose">
    <h2>Security Analysis: ${escapeHtml(domain)}</h2>
    <p>This automated report evaluates the publicly observable technical posture of <strong style="color:#e2e8f0">${escapeHtml(domain)}</strong> using four independent data sources: WHOIS registration records, DNS configuration, email authentication records (SPF and DMARC), and HTTP response security headers.</p>
    <p>The domain earned a <strong style="color:${scoreColor}">Technical Transparency Score of ${score}/100</strong>, placing it in the <strong style="color:${scoreColor}">${risk.label}</strong> category. ${risk.advice}</p>
    ${ageDays !== null ? `<p>The domain was registered <strong style="color:#e2e8f0">${ageInfo.text} ago</strong>. ${ageDays < 90 ? 'This is a very recent registration. The vast majority of e-commerce scam operations register domains within weeks of launching — this is one of the strongest fraud signals available from public data.' : ageDays < 365 ? 'The domain is under one year old. While not automatically fraudulent, newly registered domains warrant additional verification before purchasing.' : 'An established domain age is a positive signal. Long-standing domains are rarely associated with short-lived scam operations.'}</p>` : ''}
    <p>Email authentication analysis shows SPF: <strong style="color:#e2e8f0">${spf ? 'present' : 'missing'}</strong> and DMARC: <strong style="color:#e2e8f0">${dmarc ? 'present' : 'missing'}</strong>. ${!spf && !dmarc ? 'The absence of both SPF and DMARC records is a meaningful red flag — legitimate established businesses almost always configure email authentication to protect their customers from phishing.' : spf && dmarc ? 'Both email authentication records are present and configured, which is a positive indicator of a professionally maintained domain.' : 'Partial email authentication is present. A complete configuration requires both SPF and DMARC.'}</p>
    <p style="font-size:11px;color:#475569;margin-top:8px">⚠️ This report reflects publicly observable technical signals only. A high score does not guarantee a website is safe or legitimate. Always combine technical analysis with independent reviews and common sense before making any purchase.</p>
  </div>

  <!-- NordVPN CTA adaptativo -->
  <div class="nordvpn-cta" style="${score < 45 ? 'background:linear-gradient(135deg,rgba(244,63,94,0.15),rgba(244,63,94,0.05));border-color:rgba(244,63,94,0.3)' : ''}">
    <h3>${score < 45 ? '⚠️ High Risk Domain — Protect Yourself Before Visiting' : '🔒 Stay Private While Browsing Unknown Sites'}</h3>
    <p>${score < 45 ? 'This domain shows multiple risk signals. If you visit it, protect your real IP address and encrypt your connection with a VPN.' : 'Even trusted domains see your real IP every time you visit. A VPN encrypts your connection and hides your identity on any network.'}</p>
    <a href="https://scampagefinder.com/go/protection" class="nordvpn-btn">
      ${score < 45 ? '🛡️ Protect Yourself Now — NordVPN' : 'Get NordVPN — 30-Day Guarantee →'}
    </a>
  </div>

  <!-- FAQ -->
  <div style="margin-bottom:16px">
    <h2 style="margin-bottom:12px">Frequently Asked Questions</h2>
    <div class="faq-item">
      <div class="faq-q">Is ${escapeHtml(domain)} safe?</div>
      <div class="faq-a">${escapeHtml(domain)} has a Technical Transparency Score of ${score}/100 (${risk.label}). ${risk.advice}</div>
    </div>
    <div class="faq-item">
      <div class="faq-q">How old is the domain ${escapeHtml(domain)}?</div>
      <div class="faq-a">${ageDays !== null ? `The domain ${escapeHtml(domain)} was registered ${ageInfo.text} ago. ${ageInfo.flag}.` : `The registration date of ${escapeHtml(domain)} could not be determined from public WHOIS data.`}</div>
    </div>
    <div class="faq-item">
      <div class="faq-q">Does ${escapeHtml(domain)} have email authentication?</div>
      <div class="faq-a">SPF record: ${spf ? 'Detected ✓' : 'Not detected ✗'}. DMARC policy: ${dmarc ? 'Detected ✓' : 'Not detected ✗'}. ${!spf || !dmarc ? `Missing email authentication means anyone could potentially send phishing emails impersonating ${escapeHtml(domain)}.` : 'Both email authentication records are configured correctly.'}</div>
    </div>
    <div class="faq-item">
      <div class="faq-q">What does the Technical Transparency Score mean?</div>
      <div class="faq-a">The score (0–100) reflects the strength of publicly observable security signals: domain age, WHOIS data, SPF, DMARC, and HTTP security headers. It is not a legal verdict — it measures technical posture only. A high score means more signals are properly configured, which is a positive indicator but not a guarantee of legitimacy.</div>
    </div>
  </div>

  <!-- AdSense 3 -->
  <div class="ad-wrap">
    <ins class="adsbygoogle" style="display:block;width:100%" data-ad-client="${ADSENSE_CLIENT}" data-ad-slot="${ADSENSE_SLOT}" data-ad-format="auto" data-full-width-responsive="true"></ins>
    <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
  </div>

  <!-- Related links -->
  <div style="margin-bottom:24px">
    <h2 style="margin-bottom:12px">Related Security Tools & Guides</h2>
    <div class="related-grid">
      <a href="https://scampagefinder.com/check/${escapeHtml(domain)}" class="related-link">
        🔍 Live scan of ${escapeHtml(domain)}
        <span>Run a fresh real-time analysis</span>
      </a>
      <a href="https://scampagefinder.com/tools/whois-checker.html?domain=${escapeHtml(domain)}" class="related-link">
        📋 WHOIS Lookup
        <span>Full registration details</span>
      </a>
      <a href="https://scampagefinder.com/guide/how-to-check-if-a-website-is-safe.html" class="related-link">
        🛡️ How to Check if a Website is Safe
        <span>7 verification methods</span>
      </a>
      <a href="https://scampagefinder.com/guide/is-this-online-store-legit.html" class="related-link">
        🛒 Is This Online Store Legit?
        <span>9-step verification checklist</span>
      </a>
      <a href="https://scampagefinder.com/guide/what-is-domain-age-and-why-it-matters.html" class="related-link">
        📅 What is Domain Age?
        <span>Why registration date matters</span>
      </a>
      <a href="https://scampagefinder.com/best-vpn-for-privacy.html" class="related-link">
        🔒 Best VPN for Privacy 2026
        <span>NordVPN vs Surfshark vs ExpressVPN</span>
      </a>
    </div>
  </div>

  <!-- Disclaimer -->
  <p style="font-size:11px;color:#334155;line-height:1.6;text-align:center">
    This report is generated automatically from public data sources (WHOIS, DNS, HTTP headers). It does not constitute a legal assessment of any website's legitimacy or safety. Last generated: ${today}.
    <a href="https://scampagefinder.com/about.html" style="color:#475569">About ScamPageFinder</a>
  </p>

</div>
</main>

<footer>
  <div class="wrap">
    <div class="footer-links">
      <a href="https://scampagefinder.com">Domain Checker</a>
      <a href="https://scampagefinder.com/tools/whois-checker.html">WHOIS Lookup</a>
      <a href="https://scampagefinder.com/tools/spf-checker.html">SPF Checker</a>
      <a href="https://scampagefinder.com/tools/dmarc-checker.html">DMARC Checker</a>
      <a href="https://scampagefinder.com/guide/how-to-check-if-a-website-is-safe.html">Website Safety Guide</a>
      <a href="https://scampagefinder.com/guide/is-this-online-store-legit.html">Is Store Legit?</a>
      <a href="https://scampagefinder.com/best-vpn-for-privacy.html">Best VPN 2026</a>
      <a href="https://scampagefinder.com/privacy.html">Privacy Policy</a>
      <a href="https://scampagefinder.com/about.html">About</a>
    </div>
    <p>&copy; 2026 ScamPageFinder — Technical Transparency Inspector. Not a legal safety verdict.</p>
  </div>
</footer>

</body>
</html>`;
}

async function generate() {
    if (!fs.existsSync('output')) fs.mkdirSync('output');

    // _redirects para URLs bonitas
    fs.writeFileSync(path.join('output', '_redirects'), '/check/* /:splat 200\n');

    let generated = 0;
    let errors    = 0;

    for (const domain of domains) {
        try {
            console.log(`Analizando ${domain}...`);
            const res = await fetch(API_BASE + encodeURIComponent(domain));
            if (!res.ok) { errors++; continue; }
            const data = await res.json();

            const html = buildHTML(domain, data);
            fs.writeFileSync(path.join('output', `${domain}.html`), html);
            console.log(`✅ ${domain}.html (score: ${data.transparency_index?.score ?? '?'})`);
            generated++;

            // Pequeña pausa para no saturar la API
            await new Promise(r => setTimeout(r, 300));
        } catch (e) {
            console.error(`❌ Error con ${domain}:`, e.message);
            errors++;
        }
    }

    // Sitemap completo
    const today = new Date().toISOString().split('T')[0];
    const sitemapUrls = domains.map(d => {
        const clean = escapeXml(d);
        return `  <url>\n    <loc>https://reports.scampagefinder.com/check/${clean}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
    }).join('\n');

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls}\n</urlset>`;
    fs.writeFileSync(path.join('output', 'sitemap.xml'), sitemap);

    console.log(`\n✅ Completado: ${generated} páginas generadas, ${errors} errores`);
    console.log(`✅ sitemap.xml con ${domains.length} URLs`);
}

generate();
