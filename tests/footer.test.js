import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Footer Component HTML Markup Tests', () => {
  const indexPath = path.join(process.cwd(), 'index.html');
  const htmlContent = fs.readFileSync(indexPath, 'utf-8');

  it('should render semantic footer element with site-footer class', () => {
    assert.ok(htmlContent.includes('<footer class="site-footer">'), 'Footer element must exist with class site-footer');
  });

  it('should contain Rebirth Wallet branding and tagline', () => {
    assert.ok(htmlContent.includes('Rebirth Wallet'), 'Footer must contain Rebirth Wallet brand name');
    assert.ok(htmlContent.includes('The next generation self-custody Web3 crypto wallet.'), 'Footer must contain brand tagline');
  });

  it('should contain sitemap headings for Product, Community, and Legal', () => {
    assert.ok(htmlContent.includes('Product</h3>'), 'Footer must contain Product column heading');
    assert.ok(htmlContent.includes('Community</h3>'), 'Footer must contain Community column heading');
    assert.ok(htmlContent.includes('Legal</h3>'), 'Footer must contain Legal column heading');
  });

  it('should contain required social media links (Twitter/X, Discord, Telegram, GitHub)', () => {
    assert.ok(htmlContent.includes('https://x.com'), 'Footer must contain Twitter/X link');
    assert.ok(htmlContent.includes('https://discord.com'), 'Footer must contain Discord link');
    assert.ok(htmlContent.includes('https://t.me'), 'Footer must contain Telegram link');
    assert.ok(htmlContent.includes('https://github.com'), 'Footer must contain GitHub link');
  });

  it('should ensure all target="_blank" links include rel="noopener noreferrer"', () => {
    // Regex matching all target="_blank" tags in index.html
    const targetBlankMatches = htmlContent.match(/<a\s+[^>]*target="_blank"[^>]*>/g) || [];
    assert.ok(targetBlankMatches.length >= 4, 'Must have at least 4 external social links with target="_blank"');

    for (const linkTag of targetBlankMatches) {
      assert.ok(
        linkTag.includes('rel="noopener noreferrer"'),
        `Link tag missing rel="noopener noreferrer": ${linkTag}`
      );
    }
  });

  it('should render copyright statement text', () => {
    assert.ok(
      htmlContent.includes('&copy; 2026 Rebirth Wallet. All rights reserved.') ||
      htmlContent.includes('© 2026 Rebirth Wallet. All rights reserved.'),
      'Footer must render copyright notice'
    );
  });
});
