import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

async function walkFiles(dir: string, exts: string[]): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkFiles(full, exts)));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

describe('Faza 6 — Hardening prywatności, CSP i bezpieczeństwo Client-Side', () => {
  it('konfiguruje rygorystyczne nagłówki CSP i prywatności w public/_headers oraz vercel.json', async () => {
    const cfHeaders = await fs.readFile(path.join(ROOT, 'public/_headers'), 'utf8');
    expect(cfHeaders).toContain("connect-src 'self'");
    expect(cfHeaders).toContain("object-src 'none'");
    expect(cfHeaders).toContain("frame-ancestors 'none'");
    expect(cfHeaders).toContain('Referrer-Policy: no-referrer');
    expect(cfHeaders).toContain('X-Content-Type-Options: nosniff');

    const vercelRaw = await fs.readFile(path.join(ROOT, 'vercel.json'), 'utf8');
    const vercelCfg = JSON.parse(vercelRaw) as {
      headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
      rewrites: Array<{ source: string; destination: string }>;
    };
    const rootRule = vercelCfg.headers.find((h) => h.source === '/(.*)');
    expect(rootRule).toBeDefined();
    const headerMap = new Map(rootRule!.headers.map((h) => [h.key, h.value]));
    expect(headerMap.get('Content-Security-Policy')).toContain("connect-src 'self'");
    expect(headerMap.get('Content-Security-Policy')).toContain("object-src 'none'");
    expect(headerMap.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(headerMap.get('Referrer-Policy')).toBe('no-referrer');
    expect(headerMap.get('X-Content-Type-Options')).toBe('nosniff');
    expect(vercelCfg.rewrites.length).toBeGreaterThan(0);
  });

  it('nie zawiera zewnętrznych CDN-ów ani niebezpiecznych wywołań (eval / new Function / dangerouslySetInnerHTML) w src/ i index.html', async () => {
    const indexHtml = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
    const srcFiles = await walkFiles(path.join(ROOT, 'src'), ['.ts', '.tsx', '.css']);

    const forbiddenCdn = [
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'cdn.jsdelivr.net',
      'unpkg.com',
      'cdnjs.cloudflare.com',
      'googletagmanager.com',
    ];

    for (const cdn of forbiddenCdn) {
      expect(indexHtml).not.toContain(cdn);
    }
    expect(indexHtml).toContain('name="referrer" content="no-referrer"');

    for (const file of srcFiles) {
      const content = await fs.readFile(file, 'utf8');
      for (const cdn of forbiddenCdn) {
        expect(content, `${file} nie powinien odwoływać się do ${cdn}`).not.toContain(cdn);
      }
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        expect(content, `${file} używa dangerouslySetInnerHTML`).not.toContain(
          'dangerouslySetInnerHTML',
        );
        expect(content, `${file} używa eval(`).not.toMatch(/\beval\s*\(/);
        expect(content, `${file} używa new Function(`).not.toMatch(/\bnew\s+Function\s*\(/);
      }
    }
  });
});
