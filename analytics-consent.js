/* Publieke website: Basic Consent Mode. Geen Google-tag of meting zonder toestemming.
   Concepthosts tonen alleen de banner en sturen geen gegevens naar Google. */
(() => {
  'use strict';
  const id='G-DZZ32J671S';
  const storageKey='bdh-public-analytics-consent-v1';
  const duration=180*24*60*60*1000;
  const production=location.protocol==='https:' && ['buurthulpdeventer.com','www.buurthulpdeventer.com'].includes(location.hostname);
  const allowedEvents=new Set(['click_phone','click_whatsapp','click_email','generate_lead']);
  const knownPaths=new Set(['/','/wie-zijn-wij','/wat-doen-wij','/tarieven','/contact','/bedrijfsgegevens','/privacyverklaring']);
  const disabledKey='ga-disable-'+id;
  let active=false, tag=null, choice=null;
  window[disabledKey]=true;

  function readChoice(){
    try {
      const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
      if(saved && ['accepted','rejected'].includes(saved.value) &&
        Number.isFinite(saved.at) && saved.at<=Date.now() && Date.now()-saved.at<duration) return saved.value;
    } catch {}
    return null;
  }
  function saveChoice(value){
    try { localStorage.setItem(storageKey,JSON.stringify({value,at:Date.now()})); }
    catch { /* Geen opslag: keuze geldt alleen voor dit document. */ }
  }
  function clearAnalyticsCookies(){
    // Alleen bekende Google Analytics-cookies; geen andere websitecookies.
    for(const entry of document.cookie.split(';')){
      const name=entry.split('=')[0].trim();
      if(!/^_ga(?:_[A-Z0-9]+)?$/.test(name))continue;
      for(const domain of ['',location.hostname,'.buurthulpdeventer.com']){
        document.cookie=name+'=; Max-Age=0; Path=/; SameSite=Lax; Secure'+(domain?'; Domain='+domain:'');
      }
    }
  }
  function safeLocation(){
    const raw=location.pathname.replace(/\/index\.html$/,'/').replace(/\.html$/,'').replace(/\/$/,'')||'/';
    const page=new URL(knownPaths.has(raw)?raw:'/',location.origin);
    // Bewust beperkte, vooraf bekende campagnecodes: geen vrije URL-parameters of fragmenten.
    const allowed={
      utm_source:['google','facebook','instagram','flyer','poster','whatsapp','nieuwsbrief'],
      utm_medium:['qr','social','organic','referral','print','email','cpc'],
      utm_campaign:['flyer','poster','feestdagen','buurthulpdeventer','algemeen']
    };
    const incoming=new URLSearchParams(location.search);
    for(const [key,values] of Object.entries(allowed)){
      const value=incoming.get(key);
      if(values.includes(value))page.searchParams.set(key,value);
    }
    return page.href;
  }
  function safeReferrer(){
    try{
      const ref=new URL(document.referrer);
      return ['https:','http:'].includes(ref.protocol)?ref.origin+'/':'';
    }catch{return '';}
  }
  function start(){
    if(!production || active || choice!=='accepted')return;
    active=true;
    window[disabledKey]=false;
    window.dataLayer=window.dataLayer||[];
    window.gtag=function(){window.dataLayer.push(arguments);};
    window.gtag('consent','default',{
      analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'
    });
    window.gtag('consent','update',{
      analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'
    });
    window.gtag('js',new Date());
    window.gtag('config',id,{
      send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,
      cookie_expires:15552000,cookie_update:false,cookie_flags:'SameSite=Lax;Secure',
      page_location:safeLocation(),page_referrer:safeReferrer()
    });
    window.gtag('event','page_view',{send_to:id,page_location:safeLocation(),page_referrer:safeReferrer()});
    tag=document.createElement('script');
    tag.async=true;
    tag.referrerPolicy='no-referrer';
    tag.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(id);
    document.head.append(tag);
  }
  function stop(){
    window[disabledKey]=true;
    active=false;
    if(tag)tag.remove();
    clearAnalyticsCookies();
  }
  function track(event){
    if(!production || !active || choice!=='accepted' || !allowedEvents.has(event))return;
    window.gtag('event',event,{send_to:id,page_location:safeLocation(),page_referrer:safeReferrer()});
  }

  const banner=document.getElementById('bdh-cookie-banner');
  const settings=document.getElementById('bdh-cookie-settings');
  const accept=document.getElementById('bdh-cookie-accept');
  const reject=document.getElementById('bdh-cookie-reject');
  const spacer=document.getElementById('bdh-cookie-space');
  if(!banner||!settings||!accept||!reject||!spacer)return;
  function resize(){spacer.style.height=banner.hidden?'0px':Math.ceil(banner.getBoundingClientRect().height+24)+'px';}
  function show(){banner.hidden=false;resize();}
  function hide(){banner.hidden=true;resize();}
  if(typeof ResizeObserver==='function')new ResizeObserver(resize).observe(banner);
  window.addEventListener('resize',resize);
  function decide(value){
    const previouslyActive=active;
    choice=value;
    saveChoice(value);
    if(value==='accepted'){start();hide();}
    else{
      stop();hide();
      // Herladen verwijdert de reeds uitgevoerde Google-code uit het document.
      if(previouslyActive)location.reload();
    }
    settings.focus({preventScroll:true});
  }
  accept.addEventListener('click',()=>decide('accepted'));
  reject.addEventListener('click',()=>decide('rejected'));
  settings.hidden=false;
  settings.addEventListener('click',()=>{show();accept.focus({preventScroll:true});});
  choice=readChoice();
  if(choice==='accepted')start();
  else if(choice==='rejected')clearAnalyticsCookies();
  else{clearAnalyticsCookies();show();}

  window.addEventListener('storage',event=>{
    if(event.key!==storageKey && event.key!==null)return;
    const current=readChoice();
    if(current===choice)return;
    if(active && current!=='accepted'){stop();location.reload();return;}
    choice=current;
    if(choice==='accepted'){start();hide();}
    else if(choice==='rejected'){stop();hide();}
    else{stop();show();}
  });
  // Ook bij terugnavigeren uit browsercache opnieuw de opgeslagen keuze controleren.
  window.addEventListener('pageshow',event=>{
    if(event.persisted && readChoice()!==choice){stop();location.reload();}
  });
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href]');
    if(!link)return;
    const href=link.getAttribute('href')||'';
    if(/^tel:/i.test(href))track('click_phone');
    else if(/^mailto:/i.test(href))track('click_email');
    else if(/^https:\/\/(?:wa\.me|api\.whatsapp\.com)\//i.test(href))track('click_whatsapp');
  });
  // Alleen een vaste gebeurtenisnaam, nooit formulierinhoud.
  window.BDHAnalytics=Object.freeze({lead:()=>track('generate_lead')});
})();
