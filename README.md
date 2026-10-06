# ScamPageFinder report automation

This workflow refreshes cached technical data reports from the public ScamPageFinder API.

## Search and advertising policy

Generated reports are utility snapshots, not independent reviews or verdicts about a business. They use noindex,follow, contain no AdSense placements, and are not submitted in a sitemap. The live domain checker remains available to visitors.

Technical signals cannot establish whether a site is legitimate or safe. Do not add automated snapshots to a sitemap or place ads on them. If a report is ever developed into an indexable editorial page, it needs genuinely original material written and reviewed for people first, maintained separately from this automated output.

The reports site allows crawling so search engines can read each noindex directive. Do not block report paths in robots.txt; blocked pages cannot be recrawled to process that directive.

## Workflow

GitHub Actions runs daily at 03:00 UTC. The first successful run after this migration refreshes every domain in domains.txt once to replace the old report templates. Later runs refresh the next 10 domains, rotating through the list with .report-cursor.

A failed API request leaves that domain's previous report in place. If any request fails during the initial migration, the run fails without marking the migration complete; the next run retries the full migration. The generated Pages files and cursor are committed to output/ and the repository root.

After merging the migration, remove the old reports sitemap submission from Search Console because generated report URLs are no longer included in a sitemap.

The Cloudflare Worker API and the static reports site are separate deployments. Never commit passwords or API tokens to this repository.
