// generate.js - Genera informes HTML estáticos a partir de dominios
const fs = require('fs');
const path = require('path');

// Cambia esta URL si tu API está en otro dominio
const API_BASE = 'https://scampagefinder-api.fotografiacamats.workers.dev/?domain=';

// Lee la lista de dominios desde domains.txt
const domains = fs.readFileSync('domains.txt', 'utf8').split('\n').filter(Boolean);

// Función para escapar caracteres HTML en el nombre del dominio
function escapeHtml(text) {
    return text.replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[m]);
}

async function generate() {
    // Crear carpeta output si no existe
    if (!fs.existsSync('output')) {
        fs.mkdirSync('output');
    }

    for (const domain of domains) {
        try {
            console.log(`Analizando ${domain}...`);
            const res = await fetch(API_BASE + domain);
            if (!res.ok) {
                console.error(`Error HTTP ${res.status} para ${domain}`);
                continue;
            }
            const data = await res.json();

            // Generar un HTML básico pero optimizado para SEO
            const score = data.transparency_index.score;
            const status = data.transparency_index.label;
            const spf = data.email_security.spf.detected ? 'Yes' : 'No';
            const dmarc = data.email_security.dmarc.detected ? 'Yes' : 'No';
            const hsts = data.web_security.hsts ? 'Yes' : 'No';
            const csp = data.web_security.csp ? 'Yes' : 'No';

            // Añadir meta description y Schema.org para SEO dinámico
            const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${data.domain} Security Report - ScamPageFinder</title>
<meta name="description" content="Is ${data.domain} safe? Score: ${score}/100. Check DNS, SPF, DMARC, SSL, and security headers in this technical transparency report.">
<link rel="canonical" href="https://scampagefinder.com/check/${data.domain}">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemReview",
  "itemReviewed": {
    "@type": "WebSite",
    "name": "${data.domain}",
    "url": "https://${data.domain}"
  },
  "reviewRating": {
    "@type": "Rating",
    "ratingValue": "${score}",
    "bestRating": "100",
    "worstRating": "0"
  },
  "author": {
    "@type": "Organization",
    "name": "ScamPageFinder",
    "url": "https://scampagefinder.com"
  }
}
</script>
</head>
<body>
<h1>${data.domain}</h1>
<p><strong>Score:</strong> ${score}/100</p>
<p><strong>Status:</strong> ${status}</p>
<p><strong>SPF:</strong> ${spf}</p>
<p><strong>DMARC:</strong> ${dmarc}</p>
<p><strong>HSTS:</strong> ${hsts}</p>
<p><strong>CSP:</strong> ${csp}</p>
</body>
</html>`;

            fs.writeFileSync(path.join('output', `${data.domain}.html`), html);
            console.log(`✅ Generado ${data.domain}.html`);
        } catch (e) {
            console.error(`Error con ${domain}:`, e.message);
        }
    }
    console.log('Proceso terminado.');
}

generate();