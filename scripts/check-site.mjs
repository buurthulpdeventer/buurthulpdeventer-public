import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
const root = process.cwd();
const pages = ['index.html','wat-doen-wij.html','wie-zijn-wij.html','contact.html','tarieven.html','bedrijfsgegevens.html','privacyverklaring.html'];
const failures = [];
const pageText = new Map();
const check = (ok, message) => { if (!ok) failures.push(message); };
const get = path => readFileSync(join(root, path), 'utf8');
const localTarget = url => {
  const pathname = url.split(/[?#]/, 1)[0];
  if (!pathname.startsWith('/')) return null;
  if (pathname === '/') return 'index.html';
  const relative = pathname.slice(1);
  return extname(relative) ? relative : relative + '.html';
};
for (const page of pages) {
  check(existsSync(join(root, page)), page + ': pagina ontbreekt');
  if (!existsSync(join(root, page))) continue;
  const html = get(page);
  pageText.set(page, html);
  const prefix = msg => page + ': ' + msg;
  check(/<html\s+lang="nl"/.test(html), prefix('Nederlandse documenttaal ontbreekt'));
  check(/<title>[^<]+<\/title>/.test(html), prefix('paginatitel ontbreekt'));
  check(/<meta name="description" content="[^"]+"/.test(html), prefix('meta description ontbreekt'));
  check(/<meta name="viewport"/.test(html), prefix('mobiele viewport ontbreekt'));
  check(/<h1\b/.test(html), prefix('hoofdtitel ontbreekt'));
  check(/@media\s*\(max-width:\s*760px\)/.test(html), prefix('mobiele CSS ontbreekt'));
  check(/<a class="skip-link" href="#inhoud"/.test(html) && /id="inhoud"/.test(html), prefix('toetsenbordlink ontbreekt'));
  check(!/url\(["']fonts\//.test(html), prefix('verouderde lettertypepaden'));
  const route = page === 'index.html' ? '/' : '/' + page.slice(0, -5);
  const canonical = 'https://buurthulpdeventer.com' + route;
  check(html.includes('<link rel="canonical" href="' + canonical + '">'), prefix('canonical URL wijkt af'));
  check(html.includes('<meta property="og:url" content="' + canonical + '">'), prefix('sociale URL wijkt af'));
  for (const key of ['og:title', 'og:description', 'og:image']) check(html.includes('property="' + key + '"'), prefix(key + ' ontbreekt'));
  for (const [, href] of html.matchAll(/\bhref="([^"]+)"/g)) {
    if (href.startsWith('#')) check(html.includes('id="' + href.slice(1) + '"'), prefix('ankerpunt ontbreekt: ' + href));
    const relative = localTarget(href);
    if (relative) check(existsSync(join(root, relative)), prefix('interne link ontbreekt: ' + href));
  }
  for (const [, src] of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/g)) {
    if (!/^(https?:|data:)/.test(src)) check(existsSync(join(root, src)), prefix('afbeelding ontbreekt: ' + src));
  }
  for (const [, font] of html.matchAll(/url\(["']([^"']+\.woff2)["']\)/g)) check(existsSync(join(root, font)), prefix('lettertype ontbreekt: ' + font));
  for (const tag of html.match(/<img\b[^>]*>/g) || []) check(/\balt="[^"]*"/.test(tag), prefix('afbeelding zonder alt-attribuut'));
}
const home = pageText.get('index.html') || '';
const ldjson = home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
check(Boolean(ldjson), 'Homepage: gestructureerde gegevens ontbreken');
if (ldjson) try { JSON.parse(ldjson[1]); } catch { failures.push('Homepage: ongeldige JSON'); }
const contact = pageText.get('contact.html') || '';
check(contact.includes('id="contact-form"'), 'Contact: formulier ontbreekt');
check(contact.includes('fetch(FORM_SCRIPT_URL'), 'Contact: verzendcode ontbreekt');
check(/name="email"[^>]*required/.test(contact), 'Contact: vereist e-mailveld ontbreekt');
check(/name="hulpvraag"[^>]*required/.test(contact), 'Contact: vereist hulpvraagveld ontbreekt');
check(contact.includes('href="/privacyverklaring"'), 'Contact: privacyverklaring ontbreekt');
check(existsSync(join(root, 'robots.txt')), 'robots.txt ontbreekt');
check(existsSync(join(root, 'sitemap.xml')), 'sitemap.xml ontbreekt');
if (existsSync(join(root, 'robots.txt'))) check(get('robots.txt').includes('Sitemap: https://buurthulpdeventer.com/sitemap.xml'), 'robots.txt verwijst niet naar sitemap');
if (existsSync(join(root, 'sitemap.xml'))) {
  const xml = get('sitemap.xml');
  for (const page of pages) {
    const route = page === 'index.html' ? '/' : '/' + page.slice(0, -5);
    check(xml.includes('<loc>https://buurthulpdeventer.com' + route + '</loc>'), 'sitemap.xml mist ' + route);
  }
}
if (failures.length) {
  console.error('Websitecontrole mislukt: ' + failures.length + ' fout(en)');
  for (const failure of failures) console.error(' - ' + failure);
  process.exitCode = 1;
} else {
  console.log('Websitecontrole geslaagd: ' + pages.length + ' pagina’s, interne links, lettertypen, afbeeldingen, SEO, sitemap en contactformulier (alleen codecontrole).');
}
