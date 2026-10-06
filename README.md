# ScamPageFinder report automation

This workflow refreshes 10 cached technical reports per day from the public ScamPageFinder API.

## Search and advertising policy

Generated reports are utility snapshots, not independent reviews or verdicts about a business. They use \`noindex,follow\`, are excluded from the sitemap, and contain no AdSense placements. The live domain checker remains available to visitors.

Do not add generated reports to the sitemap or place ads on them. If a report is to become an indexable editorial page, create and review genuinely original material for people first, then maintain it separately from this automated output.

The reports site allows crawling so search engines can read the \`noindex\` directive. Do not block the report paths in robots.txt; blocked pages cannot be recrawled to process that directive.

## Workflow

GitHub Actions runs daily at 03:00 UTC and refreshes the next 10 domains in \`domains.txt\`, rotating through the list via \`.report-cursor\`. A failed API request leaves that domain's previous report in place. The generated Pages files are committed to \`output/\`.

The Cloudflare Worker API and the static reports site are separate deployments. Never commit passwords or API tokens to this repository.
