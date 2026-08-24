import { readFile, writeFile } from "node:fs/promises";

const ROOT_BUNDLES = [
  "content_main.js",
  "options.js",
  "popup.js",
  "side-panel.js",
];

const PROVIDER_MARKER = "myAItranslate:p0-provider-endpoint";
const BATCHING_MARKER = "myAItranslate:p0-subtitle-batching";
const YOUTUBE_MARKER = "myAItranslate:p0-youtube-timeline";

function assertSingleMatch(source, regex, label, file) {
  const matches = [...source.matchAll(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`))];
  if (matches.length !== 1) {
    throw new Error(`${file}: expected exactly one ${label} anchor, found ${matches.length}`);
  }
  return matches[0];
}

function patchProviderEndpoint(source, file) {
  if (source.includes(PROVIDER_MARKER)) return source;

  const regex = /function ([A-Za-z_$][\w$]*)\(e,t\)\{let n=new URL\(e\);t\.startsWith\("http"\)\|\|\(t="https:\/\/"\+t\);let r=new URL\(t\);return r\.pathname!=="\/"\?r\.toString\(\):\(n\.host=r\.host,r\.port&&\(n\.port=r\.port\),r\.protocol&&\(n\.protocol=r\.protocol\),r\.username&&\(n\.username=r\.username\),r\.password&&\(n\.password=r\.password\),n\.toString\(\)\)\}/;
  const match = assertSingleMatch(source, regex, "provider endpoint resolver", file);
  const functionName = match[1];
  const replacement = `function ${functionName}(e,t){/*${PROVIDER_MARKER}*/let n=new URL(e);t=String(t).trim(),/^https?:\\/\\//i.test(t)||(t="https://"+t);let r=new URL(t),i=n.pathname,a=r.pathname.replace(/\\/+$/,""),o=i.endsWith("/chat/completions")?"/chat/completions":i.endsWith("/messages")?"/messages":"";return r.pathname==="/"?(n.host=r.host,n.protocol=r.protocol,n.username=r.username,n.password=r.password,r.search&&(n.search=r.search),r.hash&&(n.hash=r.hash),n.toString()):(o&&/(?:^|\\/)v1$/i.test(a)&&(r.pathname=a+o),r.toString())}`;
  return source.replace(regex, replacement);
}

function patchSubtitleBatching(source, file) {
  if (source.includes(BATCHING_MARKER)) return source;

  const oldMethod = 'getTextLengthLimits(){let t=this.maxTextLength;this.serviceConfig&&this.serviceConfig.maxTextLengthPerRequest&&(t=this.serviceConfig.maxTextLengthPerRequest);let n=this.maxTextGroupLength;return this.serviceConfig&&this.serviceConfig.maxTextGroupLengthPerRequest&&(n=this.serviceConfig.maxTextGroupLengthPerRequest),this.translationOptions&&this.translationOptions.usageScene&&["subtitle_video","subtitle_file"].includes(this.translationOptions.usageScene)&&this.serviceConfig&&this.serviceConfig.maxTextGroupLengthPerRequestForSubtitle&&(n=this.serviceConfig.maxTextGroupLengthPerRequestForSubtitle),{maxTextLength:t,maxTextGroupLength:n}}';
  const occurrences = source.split(oldMethod).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${file}: expected exactly one subtitle batching method, found ${occurrences}`);
  }

  const replacement = `getTextLengthLimits(){/*${BATCHING_MARKER}*/let t=this.maxTextLength;this.serviceConfig&&this.serviceConfig.maxTextLengthPerRequest&&(t=this.serviceConfig.maxTextLengthPerRequest);let n=this.maxTextGroupLength;this.serviceConfig&&this.serviceConfig.maxTextGroupLengthPerRequest&&(n=this.serviceConfig.maxTextGroupLengthPerRequest);let r=this.translationOptions?.usageScene,i=typeof r=="string"&&(r==="subtitle"||r.startsWith("subtitle_")),a=i&&this.serviceConfig?.maxTextGroupLengthPerRequestForSubtitle;a&&(n=a);let o=Number(n);return n=Number.isFinite(o)&&o>0?Math.max(1,Math.floor(o)):Math.max(1,Math.floor(Number(this.maxTextGroupLength)||1)),{maxTextLength:t,maxTextGroupLength:n}}`;
  return source.replace(oldMethod, replacement);
}

function findMethodRange(source, classStart, methodName) {
  const classEnd = source.indexOf("};var M0e=", classStart);
  if (classEnd < 0) throw new Error("content_main.js: YouTube subtitle class end anchor not found");

  const escapedName = methodName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declaration = new RegExp(`}(?:async )?${escapedName}\\(`, "g");
  declaration.lastIndex = classStart;
  const match = declaration.exec(source);
  if (!match || match.index >= classEnd) {
    throw new Error(`content_main.js: method ${methodName} declaration not found`);
  }
  const start = match.index + 1;

  const openBrace = source.indexOf("{", start);
  if (openBrace < 0) throw new Error(`content_main.js: method ${methodName} has no body`);

  let depth = 0;
  let state = "code";
  let escaped = false;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "single" || state === "double" || state === "template") {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (
        (state === "single" && char === "'") ||
        (state === "double" && char === '"') ||
        (state === "template" && char === "`")
      ) {
        state = "code";
      }
      continue;
    }

    if (state === "line-comment") {
      if (char === "\n") state = "code";
      continue;
    }
    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        state = "code";
        index += 1;
      }
      continue;
    }

    if (char === "'") {
      state = "single";
      continue;
    }
    if (char === '"') {
      state = "double";
      continue;
    }
    if (char === "`") {
      state = "template";
      continue;
    }
    if (char === "/" && next === "/") {
      state = "line-comment";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      state = "block-comment";
      index += 1;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return { start, end: index + 1 };
    }
  }

  throw new Error(`content_main.js: method ${methodName} body is unbalanced`);
}

function replaceMethod(source, classStart, methodName, replacement) {
  const range = findMethodRange(source, classStart, methodName);
  return source.slice(0, range.start) + replacement + source.slice(range.end);
}

function patchYoutubeTimeline(source) {
  if (source.includes(YOUTUBE_MARKER)) return source;

  let classStart = source.indexOf("var m4=class extends e0{");
  if (classStart < 0) throw new Error("content_main.js: YouTube subtitle class anchor not found");

  const normalizeMethod = `normalizeSubtitleEvents(t){/*${YOUTUBE_MARKER}*/let n=Array.isArray(t)?t:[],r=n.map((i,a)=>{if(!i||!Array.isArray(i.segs)&&typeof i.text!="string")return null;let o=Number(i.tStartMs);if(!Number.isFinite(o)||o<0)return null;let s=typeof i.text=="string"?i.text:i.segs.map(c=>c?.utf8||"").join("");if(s=s.replaceAll(\`\n\`," "),!s.trim())return null;let u=Number(i.dDurationMs);return{...i,tStartMs:o,dDurationMs:Number.isFinite(u)&&u>0?u:0,text:s,segs:[{utf8:s}],__imtOrder:a}}).filter(Boolean).sort((i,a)=>i.tStartMs-a.tStartMs||i.__imtOrder-a.__imtOrder),i=[];for(let a of r){let o=i[i.length-1],s=o&&a.wWinId!=null&&o.wWinId===a.wWinId,u=o&&a.tStartMs<=o.tStartMs+Math.max(o.dDurationMs||0,5e3);if(a.aAppend===1&&o&&(s||u)){let l=nR(o.text),c=nR(a.text);c.startsWith(l)?o.text=a.text:l.endsWith(c)||(o.text+=a.text);let g=a.tStartMs+a.dDurationMs-o.tStartMs;g>o.dDurationMs&&(o.dDurationMs=g);continue}i.push(a)}let a=[];for(let o of i){let s=nR(o.text);if(!s)continue;let u=a[a.length-1];if(u?.tStartMs===o.tStartMs&&u.text===s){u.dDurationMs=Math.max(u.dDurationMs,o.dDurationMs);continue}let l={...o,text:s,segs:[{utf8:s}]};delete l.aAppend,a.push(l)}return a.map((o,s)=>{let u=s+1;for(;u<a.length&&a[u].tStartMs<=o.tStartMs;)u++;let l=a[u]?.tStartMs,c=Number.isFinite(l)&&l>o.tStartMs?l-o.tStartMs:0,g=o.dDurationMs;g>0||(g=c||3e3),c>0&&g>c&&(g=c),g=Math.max(100,Math.min(g,3e4));let m={...o,dDurationMs:g};return delete m.__imtOrder,m})}`;

  const matchMethod = `matchSubtitleByTime(t,n,r=1e3){let i=0;return t.map(a=>{for(;i<n.length&&n[i].tStartMs<a.tStartMs-r;)i++;let o=-1,s=r+1;for(let u=i;u<n.length&&n[u].tStartMs<=a.tStartMs+r;u++){let l=Math.abs(n[u].tStartMs-a.tStartMs);l<s&&(s=l,o=u)}return o<0?"":(i=o+1,n[o].text||"")})}`;

  const mergeSegsMethod = `mergeSegsText(t){let n={...t};return n.events=this.normalizeSubtitleEvents(n.events||[]),n}`;
  const mergeSelfMethod = `mergeSelfSubtitle(t,n){return this.normalizeSubtitleEvents(JSON.parse(JSON.stringify(t||[])))}`;
  const formatMethod = `formatToSubtitleItem(t){return this.normalizeSubtitleEvents(t).map(n=>({start:n.tStartMs/1e3,end:(n.tStartMs+n.dDurationMs)/1e3,text:n.text||"",translation:n.translation||""}))}`;
  const youtubeTranslateMethod = `async requestYoutubeTranslateSubtitle(t,n,r,i){if(this.config.preTranslation)return null;try{let a=this.getYoutubeTranslateLang(this.ctx.targetLanguage,i),o=new URL(t);o.searchParams.set("tlang",a);let s=await this.fetchSubtitle(o.toString());if(!await this.checkTranslationSubtitleLanguage(s.map(f=>f.text).join(\`\n\`)))return null;let u=this.mergeSelfSubtitle(n,this.getSpaceWithLang(r)),l=this.mergeSelfSubtitle(s,this.getSpaceWithLang(this.ctx.targetLanguage)),c=l.filter(f=>!!f.text);if(!u.length||!c.length)return null;let g=this.matchSubtitleByTime(u,c),m=g.filter(Boolean).length/Math.max(1,u.length);if(m<.6)return null;return k.debug("youtube subtitle ",u,l),u.map((f,h)=>({start:f.tStartMs/1e3,end:(f.tStartMs+f.dDurationMs)/1e3,text:f.text||"",translation:g[h]||""}))}catch(a){return k.error("youtube translate subtitle error:",a),null}}`;

  source = replaceMethod(source, classStart, "requestYoutubeTranslateSubtitle", youtubeTranslateMethod);
  classStart = source.indexOf("var m4=class extends e0{");
  source = replaceMethod(source, classStart, "mergeSegsText", `${normalizeMethod}${matchMethod}${mergeSegsMethod}`);
  classStart = source.indexOf("var m4=class extends e0{");
  source = replaceMethod(source, classStart, "mergeSelfSubtitle", mergeSelfMethod);
  classStart = source.indexOf("var m4=class extends e0{");
  source = replaceMethod(source, classStart, "formatToSubtitleItem", formatMethod);
  return source;
}

let modified = 0;
for (const file of ROOT_BUNDLES) {
  const original = await readFile(file, "utf8");
  let next = patchProviderEndpoint(original, file);
  next = patchSubtitleBatching(next, file);
  if (file === "content_main.js") next = patchYoutubeTimeline(next);

  if (next !== original) {
    await writeFile(file, next);
    modified += 1;
    console.log(`patched ${file}`);
  } else {
    console.log(`already patched ${file}`);
  }
}

console.log(`P0 backports complete; modified ${modified} bundle(s)`);
