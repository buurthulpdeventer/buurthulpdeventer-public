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
const rates = pageText.get('tarieven.html') || '';
// Compacte feestdagenkaart met apart, toegankelijk uitklapbaar voorwaardenblok.
if (home.includes('id="feestdagenactie-titel"')) {
  check(home.includes('€10,00 per uur') && home.includes('€15,00'), 'Feestdagenactie homepage: correcte actieprijs ontbreekt');
  check(home.includes('href="/tarieven#feestdagen-tarieven"'), 'Feestdagenactie homepage: link naar actietarieven ontbreekt');
  check(home.includes('href="/tarieven#feestdagen-voorwaarden">Voorwaarden</a>'), 'Feestdagenactie homepage: aparte voorwaardenlink ontbreekt');
  const homeAction = home.split('<section class="feestdagenactie"')[1]?.split('</section>')[0] || '';
  check(!homeAction.includes('per kwartier') && !homeAction.includes('kilometervergoeding'), 'Feestdagenactie homepage is niet compact');
  const cardStart = rates.indexOf('<div class="rates-card">');
  const actionStart = rates.indexOf('<section id="feestdagen-tarieven" class="rates-seasonal"');
  const actionEnd = rates.indexOf('</section>', actionStart);
  const cardEnd = rates.indexOf('</div>', actionEnd);
  const conditionsStart = rates.indexOf('<details class="rates-terms" id="feestdagen-voorwaarden">');
  const action = rates.slice(actionStart, actionEnd);
  check(cardStart >= 0 && actionStart > cardStart && actionEnd > actionStart && cardEnd > actionEnd,
    'Feestdagentarieven moeten binnen de bestaande tarievenkaart staan');
  check(conditionsStart > cardEnd, 'Feestdagenvoorwaarden moeten buiten de tarievenkaart staan');
  check(action.includes('€10,00/u') && !action.includes('per kwartier') &&
    action.includes('href="#feestdagen-voorwaarden">Voorwaarden</a>'),
    'Actiekaart tarieven is te uitgebreid of mist de voorwaardenlink');
  check(rates.includes('€15,00/u') && rates.includes('€0,25/km'), 'Normaal tarief of kilometervergoeding ontbreekt');
  check(rates.includes('€10,00 per gewerkt uur, afgerekend per uur en niet per kwartier'),
    'Feestdagenvoorwaarden: afrekenwijze ontbreekt');
  check(rates.includes('Vraag naar de exacte geldigheidsperiode.') &&
    rates.includes('Wij bevestigen vóór het maken van een afspraak'),
    'Feestdagenvoorwaarden: toepasselijkheid of geldigheidsperiode ontbreekt');
  check(rates.includes('repeating-linear-gradient(') && rates.includes('rates-seasonal__stripe'),
    'Feestdagentarieven: rood-wit patroon ontbreekt');
  check(rates.includes("feestdagenVoorwaarden.open = true") &&
    rates.includes("window.addEventListener('hashchange', openFeestdagenVoorwaarden)"),
    'Feestdagenvoorwaarden openen niet direct via de link');
  check(!rates.includes('Actietarief volgt'), 'Feestdagentarieven: oude tijdelijke prijstekst staat nog op de pagina');
}
const contact = pageText.get('contact.html') || '';
check(contact.includes('id="contact-form"'), 'Contact: formulier ontbreekt');
check(contact.includes('fetch(FORM_SCRIPT_URL'), 'Contact: verzendcode ontbreekt');
check(/<input type="email" name="email" autocomplete="email">/.test(contact), 'Contact: optioneel e-mailveld ontbreekt');
check(/<input type="tel" name="telefoon"[^>]*required>/.test(contact), 'Contact: vereist telefoonnummer ontbreekt');
check(/name="hulpvraag"[^>]*required/.test(contact), 'Contact: vereist hulpvraagveld ontbreekt');
check(contact.includes('href="/privacyverklaring"'), 'Contact: privacyverklaring ontbreekt');
for (const [name, page] of [['Homepage', home], ['Contact', contact]]) {
  check(page.includes('href="tel:+31570756230"'), name + ': directe belknop ontbreekt');
  check(page.includes('href="https://wa.me/31570756230"'), name + ': directe WhatsApp-knop ontbreekt');
}
check(contact.includes('new FormData(form)'), 'Contact: formulier verstuurt niet alle velden, inclusief optioneel e-mailadres');
check(contact.includes('Een e-mailadres is niet nodig.'), 'Contact: uitleg over optioneel e-mailadres ontbreekt');
check(rates.includes('Wij bevestigen vóór het maken van een afspraak'), 'Actie: voorafgaande tariefbevestiging ontbreekt');
check(rates.includes('Vraag naar de exacte geldigheidsperiode.'), 'Actie: geldigheidsperiode is onvoldoende toegelicht');
const privacy=pageText.get('privacyverklaring.html')||'';
check(privacy.includes('uiterlijk 6 maanden na het laatste contact'), 'Privacy: doelbewaartermijn contactverzoeken ontbreekt');
check(privacy.includes('moet daarom door ons handmatig gebeuren'), 'Privacy: handmatige verwijdering ontbreekt');
check(privacy.includes('tijdelijk in beveiligde back-ups staan'), 'Privacy: bewaartermijn back-ups ontbreekt');
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
