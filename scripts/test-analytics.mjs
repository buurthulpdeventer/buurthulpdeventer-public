import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('analytics-consent.js','utf8');
const key='bdh-public-analytics-consent-v1';
function harness({hostname='buurthulpdeventer.com',saved=null,search='',referrer='',cookie='_ga=123; _ga_DZZ32J671S=456; other=keep'}={}){
  const handlers={},docHandlers={},nodes={},scripts=[],cookies=[],state=new Map();
  if(saved)state.set(key,JSON.stringify(saved));
  const make=()=>({hidden:true,style:{},events:{},addEventListener(name,fn){this.events[name]=fn;},focus(){},getBoundingClientRect(){return {height:200};}});
  for(const id of ['bdh-cookie-banner','bdh-cookie-settings','bdh-cookie-accept','bdh-cookie-reject','bdh-cookie-space'])nodes[id]=make();
  const loc={protocol:'https:',hostname,origin:'https://'+hostname,pathname:'/contact',search,reloads:0,reload(){this.reloads++;}};
  const doc={referrer,getElementById:id=>nodes[id],head:{append(s){scripts.push(s);}},createElement(){return {remove(){this.removed=true;}};},addEventListener(n,f){docHandlers[n]=f;}};
  Object.defineProperty(doc,'cookie',{get:()=>cookie,set:v=>cookies.push(v)});
  const win={addEventListener(n,f){handlers[n]=f;}};
  const storage={getItem:k=>state.get(k)||null,setItem:(k,v)=>state.set(k,v)};
  vm.runInNewContext(source,{window:win,document:doc,location:loc,localStorage:storage,Date,URL,URLSearchParams});
  return {win,loc,nodes,scripts,cookies,state,handlers,docHandlers,click(id){nodes['bdh-cookie-'+id].events.click();},link(href){docHandlers.click({target:{closest:()=>({getAttribute:()=>href})}});},events(){return (win.dataLayer||[]).map(x=>Array.from(x));}};
}
test('No Google script or event until affirmative consent, and refusal stays private',()=>{
  const h=harness();
  assert.equal(h.nodes['bdh-cookie-banner'].hidden,false);
  assert.equal(h.scripts.length,0);
  h.link('tel:+31570756230');h.win.BDHAnalytics.lead();
  assert.equal(h.events().length,0);
  h.click('reject');
  assert.equal(h.nodes['bdh-cookie-banner'].hidden,true);
  assert.equal(JSON.parse(h.state.get(key)).value,'rejected');
  assert.equal(h.scripts.length,0);
  assert.ok(h.cookies.every(c=>!c.startsWith('other=')));
  h.click('settings');
  assert.equal(h.nodes['bdh-cookie-banner'].hidden,false);
});
test('Consent enables GA4 once and only sends approved contact event types',()=>{
  const h=harness({search:'?email=private%40example.com&utm_source=flyer&utm_medium=qr&utm_campaign=secret-name',referrer:'https://example.com/private?email=a@b.nl'});
  h.click('accept');
  assert.equal(h.scripts.length,1);
  assert.match(h.scripts[0].src,/G-DZZ32J671S$/);
  h.click('settings');h.click('accept');
  assert.equal(h.scripts.length,1);
  h.link('tel:0612345678');h.link('mailto:secret@example.com');
  h.link('https://wa.me/31612345678?text=private');
  h.link('https://example.org/other');
  h.win.BDHAnalytics.lead();
  const events=h.events().filter(x=>x[0]==='event');
  assert.deepEqual(events.map(x=>x[1]),['page_view','click_phone','click_email','click_whatsapp','generate_lead']);
  const json=JSON.stringify(h.events());
  for(const secret of ['private','secret','0612345678','31612345678','@example.com'])assert.ok(!json.includes(secret));
  assert.ok(json.includes('utm_source=flyer'));
  assert.ok(json.includes('utm_medium=qr'));
  assert.equal(events[0][2].page_referrer,'https://example.com/');
  const config=h.events().find(x=>x[0]==='config')[2];
  assert.equal(config.allow_google_signals,false);
  assert.equal(config.allow_ad_personalization_signals,false);
});
test('Withdrawal disables tracking, removes GA cookies and reloads',()=>{
  const h=harness({saved:{value:'accepted',at:Date.now()}});
  assert.equal(h.scripts.length,1);
  h.click('settings');h.click('reject');
  assert.equal(h.win['ga-disable-G-DZZ32J671S'],true);
  assert.equal(h.loc.reloads,1);
  assert.equal(h.scripts[0].removed,true);
  const before=h.events().length;h.win.BDHAnalytics.lead();assert.equal(h.events().length,before);
  assert.ok(h.cookies.some(c=>c.startsWith('_ga_DZZ32J671S=')));
});
test('Preview and admin hosts never load GA; expired consent requires a new choice',()=>{
  for(const host of ['preview.example.workers.dev','admin.buurthulpdeventer.com']){
    const h=harness({hostname:host});
    h.click('accept');h.win.BDHAnalytics.lead();
    assert.equal(h.scripts.length,0);assert.equal(h.events().length,0);
  }
  const expired=harness({saved:{value:'accepted',at:Date.now()-181*86400000}});
  assert.equal(expired.scripts.length,0);assert.equal(expired.nodes['bdh-cookie-banner'].hidden,false);
});
test('Withdrawal in another tab also immediately disables GA',()=>{
  const h=harness({saved:{value:'accepted',at:Date.now()}});
  h.state.set(key,JSON.stringify({value:'rejected',at:Date.now()}));
  h.handlers.storage({key});
  assert.equal(h.win['ga-disable-G-DZZ32J671S'],true);
  assert.equal(h.loc.reloads,1);
});
