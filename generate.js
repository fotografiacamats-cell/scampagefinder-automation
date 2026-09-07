// generate.js - Genera informes HTML estáticos a partir de dominios
const fs = require('fs');
const path = require('path');

// Cambia esta URL si tu API está en otro dominio
const API_BASE = 'https://scampagefinder-api.fotografiacamats.workers.dev/?domain=';

// Lee la lista de dominios desde domains.txt (Limpia espacios, saltos de línea y retornos de carro de Windows)
const domains = fs.readFileSync('domains.txt', 'utf8')
    .split('\n')
    .map(d => d.trim())
    .filter(Boolean);

// Función para escapar caracteres especiales de XML (evita errores con h&m.com, etc.)
function escapeXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function generate() {
    // Crear carpeta output si no existe
    if (!fs.existsSync('output')) {
        fs.mkdirSync('output');
    }

    // Generar archivo de redirecciones para que /check/dominio funcione automáticamente
    fs.writeFileSync(path.join('output', '_redirects'), '/check/* /:splat 200');

    for (const domain of domains) {
        try {
            console.log(`Analizando ${domain}...`);
            const res = await fetch(API_BASE + domain);
            if (!res.ok) {
                console.error(`Error HTTP ${res.status} para ${domain}`);
                continue;
            }
            const data = await res.json();

            const score = data.transparency_index.score;
            const status = data.transparency_index.label;
            const spf = data.email_security.spf.detected ? 'Yes' : 'No';
            const dmarc = data.email_security.dmarc.detected ? 'Yes' : 'No';
            const hsts = data.web_security.hsts ? 'Yes' : 'No';
            const csp = data.web_security.csp ? 'Yes' : 'No';

            const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${data.domain} Security Report - ScamPageFinder</title>
<link rel="canonical" href="https://scampagefinder.com/check/${escapeXml(data.domain)}">
<style>body{background:#0f172a;color:#fff;font-family:Arial}.container{max-width:800px;margin:auto;padding:30px}.score{font-size:50px;color:#10b981}</style>
</head>
<body>
<div class="container">
<h1>${data.domain}</h1>
<p>Score: ${score}/100</p>
<p>Status: ${status}</p>
<p>SPF: ${spf}</p><p>DMARC: ${dmarc}</p><p>HSTS: ${hsts}</p><p>CSP: ${csp}</p>
</div>
</body>
</html>`;

            fs.writeFileSync(path.join('output', `${data.domain}.html`), html);
            console.log(`✅ Generado ${data.domain}.html`);
        } catch (e) {
            console.error(`Error con ${domain}:`, e.message);
        }
    }

    // Generar sitemap.xml (CORREGIDO para Google)
    const sitemapUrls = domains.map(d => {
        const cleanDomain = escapeXml(d);
        return `<url><loc>https://scampagefinder.com/check/${cleanDomain}</loc><lastmod>${new Date().toISOString().split('T')[0]}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`;
    }).join('\n');

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls}\n</urlset>`;

    fs.writeFileSync(path.join('output', 'sitemap.xml'), sitemap);
    console.log('✅ Generado sitemap.xml');
    console.log('Proceso terminado. Archivo _redirects y sitemap.xml generados automáticamente.');
}

generate();
