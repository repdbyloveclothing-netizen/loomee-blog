// Loomee blog builder.
// Reads every article from the posts/ folder (one Markdown file per article) and writes one real
// HTML page per article (plus the blog index, sitemap, robots.txt and 404 page) into _site/.
// GitHub Actions runs this on every push to main and publishes _site/ on GitHub Pages, so adding a
// file to posts/ (for example from Marblism's GitHub connection) is all it takes to publish.
//
// A post is posts/<web-address>.md, starting with (all optional):
//   ---
//   title: "How to Get a Notification Light on Any Android Phone"
//   description: "The meta description shown in Google (about 150 characters)."
//   date: 2026-11-25          (the day the file was first added is used if left out)
//   ---
// then the article in Markdown. Optional extras: updated, read_time, keywords, image, slug, draft: true.
// Marblism's own field names (excerpt, publishedAt, coverImage, tags, ...) work too. A
// "Meta description: ..." line in the article is used as the description and removed from the page,
// and a leading "# Title" line is used as the title if there is none above.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sanitizeHtml from 'sanitize-html';
import * as cheerio from 'cheerio';
import matter from 'gray-matter';
import { marked } from 'marked';

// ---- settings ----------------------------------------------------------------------------
const POSTS_DIR = process.env.POSTS_DIR || 'posts';
// Where this blog is served. When it moves to its own domain, change this one line
// (for example 'https://blog.repdbylove.com') and every canonical link and the sitemap follow.
const BASE_URL = (process.env.BASE_URL || 'https://blog.repdbylove.com').replace(/\/$/, '');
const SITE_LANG = 'en';
const OUT = process.env.OUT_DIR || '_site';
const BASE_PATH = new URL(BASE_URL).pathname.replace(/\/$/, ''); // '/loomee-blog' or ''
const PLAY = 'https://play.google.com/store/apps/details?id=com.repdbylove.lumio';
const SITE = 'https://repdbylove.com';
const APP_PAGE = `${SITE}/loomee`;
// Google Search Console ownership check for this blog's address. Paste the code Search Console
// gives you (HTML tag method) between the quotes; leave empty until then.
const GOOGLE_VERIFY = '';

// Loomee's night look, matching repdbylove.com/loomee: Manrope, near-black, lavender accent.
const CSS = `
:root{--night:#14151A;--deep:#0B0C10;--surface:#1F2127;--line:#2E3038;--text:#F3F2EE;--muted:#B3B2AE;--accent:#B892FF;--glow:#29D9F5;color-scheme:dark}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
html,body{margin:0}
body{font-family:'Manrope',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.6;font-size:17px;color:var(--text);background:var(--night);min-height:100vh;display:flex;flex-direction:column}
img{max-width:100%}
a{color:var(--accent)}a:hover{color:#D4BEFF}
a:focus-visible,summary:focus-visible{outline:2px solid var(--glow);outline-offset:3px;border-radius:6px}
h1,h2,h3,h4{margin:0;letter-spacing:-.02em;text-wrap:balance}
.wrap{width:100%;max-width:1080px;margin:0 auto;padding-left:max(20px,env(safe-area-inset-left,0px));padding-right:max(20px,env(safe-area-inset-right,0px))}
.hdr{display:flex;align-items:center;justify-content:space-between;gap:12px 20px;flex-wrap:wrap;padding-top:22px;padding-bottom:22px}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:20px;color:var(--text);text-decoration:none}
.brand svg{width:34px;height:34px}
.brand span{color:var(--muted);font-weight:600;font-size:15px}
.links{display:flex;align-items:center;gap:8px 22px;flex-wrap:wrap}
.links a{color:var(--text);text-decoration:none;font-weight:600;font-size:15px}
.links a[aria-current]{color:var(--accent)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;font-weight:800;font-size:16px;border-radius:999px;padding:14px 24px;min-height:50px;text-decoration:none;background:var(--text);color:var(--night);border:0}
.btn:hover{color:var(--night);opacity:.92}
.links .btn,.links .btn:hover,.links a.btn{color:var(--night)}
.btn svg{width:18px;height:18px}
.btn.sm{padding:10px 18px;min-height:44px;font-size:15px}
.eyebrow{font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin:0}
.meta{color:var(--muted);font-size:15px;margin:0}
.phero{padding-top:36px;padding-bottom:44px;display:flex;flex-direction:column;gap:16px;max-width:760px}
.phero h1{font-size:clamp(2.4rem,6vw,3.8rem);line-height:1.04;font-weight:800}
.phero h1 span{color:var(--accent)}
.phero p{margin:0;font-size:19px;color:var(--muted);max-width:40ch}
main{flex:1 0 auto;padding-bottom:80px}
.feed{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:18px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:22px}
.entry{display:flex;flex-direction:column;gap:12px;padding:24px 24px 26px;color:var(--text);text-decoration:none;transition:border-color .2s,transform .2s;min-width:0}
.entry:hover{border-color:var(--accent);transform:translateY(-2px)}
.entry h2{font-size:21px;line-height:1.25;font-weight:800}
.entry p{margin:0;color:var(--muted);font-size:15px;line-height:1.55}
.entry .meta{margin-top:auto;font-size:14px}
.entry.first{grid-column:1/-1;padding:34px 34px 36px;background:radial-gradient(ellipse 60% 120% at 100% 0%,rgba(184,146,255,.16),transparent 70%),var(--surface)}
.entry.first h2{font-size:clamp(1.6rem,3.4vw,2.2rem);line-height:1.15}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent),0 0 22px var(--accent)}
.notice{padding:28px 30px;color:var(--muted)}.notice b{color:var(--text);font-size:20px}
.back{display:inline-flex;align-items:center;min-height:44px;font-weight:700;color:var(--text);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:0 18px;font-size:14px}
.back:hover{border-color:var(--accent);color:var(--text)}
.ahero{padding-top:28px;padding-bottom:30px;display:flex;flex-direction:column;gap:16px;align-items:flex-start;max-width:760px}
.ahero h1{font-size:clamp(2rem,5vw,3rem);line-height:1.08;font-weight:800}
.article{max-width:720px}
.body h2{font-size:28px;margin:1.7em 0 .5em;line-height:1.2;font-weight:800}
.body h3{font-size:21px;margin:1.4em 0 .3em;font-weight:700}
.body h4{font-size:18px;margin:1.2em 0 .3em;font-weight:700}
.body p{margin:0 0 1.1em;font-size:18px;color:#DCDBD7;line-height:1.75}
.body ul,.body ol{margin:0 0 1.2em;padding-left:1.4em;font-size:18px;color:#DCDBD7;line-height:1.7}.body li{margin-bottom:.4em}
.body strong{color:var(--text)}
.body a{font-weight:600}
.body blockquote{margin:1.6em 0;padding:20px 24px;background:var(--surface);border:1px solid var(--line);border-radius:18px;font-size:20px;font-weight:600;line-height:1.45}
.body blockquote p{margin:0;color:var(--text)}
.body code{background:var(--surface);border-radius:6px;padding:2px 6px;font-size:.92em}
.body pre{overflow-x:auto;background:var(--surface);border-radius:14px;padding:16px}
.body hr{border:0;border-top:1px solid var(--line);margin:2em 0}
.body .tablewrap{overflow-x:auto;margin:0 0 1.2em}
.body table{border-collapse:collapse;width:100%;font-size:16px;color:#DCDBD7}
.body th,.body td{border-bottom:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top}
.body th{color:var(--text)}
.body img{display:block;max-width:100%;height:auto;border-radius:18px;margin:0 auto 1.2em}
.body figure{margin:0 0 1.4em}.body figcaption{font-size:14px;color:var(--muted);text-align:center;margin-top:-.6em}
.toc{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:18px 24px;margin:0 0 1.8em}
.toc h2{font-size:16px;margin:0 0 6px}
.toc ol{margin:0;padding-left:1.2em;font-size:16px;line-height:1.6}
.toc a{color:var(--text);text-decoration:none}.toc a:hover{color:var(--accent)}
.cta{margin:2.4em 0 0;padding:36px 30px;border-radius:26px;text-align:center;border:1px solid var(--line);background:radial-gradient(ellipse 70% 90% at 50% 0%,rgba(184,146,255,.22),transparent 70%),var(--surface);display:flex;flex-direction:column;align-items:center;gap:14px}
.cta h2{font-size:clamp(1.5rem,3.4vw,2rem);line-height:1.15;font-weight:800}
.cta p{margin:0;max-width:34em;color:var(--muted);font-size:16px}
.cta small{color:var(--muted);font-size:14px}
.foot{border-top:1px solid var(--line);margin-top:auto}
.fwrap{padding-top:24px;padding-bottom:40px;display:flex;align-items:center;justify-content:space-between;gap:12px 32px;flex-wrap:wrap;font-size:15px;color:var(--muted)}
.fwrap p{margin:0}
.flinks{display:flex;flex-wrap:wrap;gap:8px 22px}
.flinks a{color:var(--muted);text-decoration:none}.flinks a:hover{color:var(--text);text-decoration:underline}
@media (max-width:640px){
  .hdr .btn{display:none}
  .entry.first{padding:24px 22px 26px}
  .body p,.body ul,.body ol{font-size:17px}
  .body h2{font-size:24px}
  .cta{padding:28px 20px}
}
@media (prefers-reduced-motion:reduce){.entry{transition:none}html{scroll-behavior:auto}}
`;

// ---- helpers -----------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => {
  const d = new Date(String(iso || '').slice(0, 10) + 'T00:00:00Z');
  return isNaN(d) ? '' : d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};
const metaLine = (a) => [fmtDate(a.published), a.read_time ? `${a.read_time} min read` : ''].filter(Boolean).join(' · ');
const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const ymd = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v || '').slice(0, 10));
const today = () => new Date().toISOString().slice(0, 10);

// The day a post file was first added to the blog (from git history), for posts with no date.
function addedOn(file) {
  try {
    const out = execFileSync('git', ['log', '--diff-filter=A', '--follow', '--format=%as', '--', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n');
    return out[out.length - 1] || today();
  } catch { return today(); }
}

// h2 headings get ids for the table of contents; the FAQ heading is always #faq and "Key takeaways" gets none.
function headingIds(html) {
  const used = new Set();
  return html.replace(/<h2>([\s\S]*?)<\/h2>/g, (m, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
    if (/^key takeaways$/i.test(text)) return m;
    let id = /^(faq|faqs|frequently asked questions)$/i.test(text) ? 'faq' : slugify(text).slice(0, 64).replace(/-+$/, '');
    if (!id) return m;
    for (let n = 2, base = id; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return `<h2 id="${id}">${inner}</h2>`;
  });
}

// Pictures: web addresses are used as they are; a picture stored in this repo is copied onto the site.
const MEDIA = new Set();
function localMedia(src, postFile) {
  if (!src || /^(https?:|data:|#)/i.test(src)) return src;
  let clean = decodeURIComponent(src.split(/[?#]/)[0]);
  if (BASE_PATH && clean.startsWith(BASE_PATH + '/')) clean = clean.slice(BASE_PATH.length);
  const abs = clean.startsWith('/') ? path.resolve('.' + clean) : path.resolve(path.dirname(postFile), clean);
  const rel = path.relative(process.cwd(), abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return '';
  MEDIA.add(rel);
  return `${BASE_PATH}/${rel.split(path.sep).map(encodeURIComponent).join('/')}`;
}
const fixImages = (html, postFile) => html.replace(/<img\b([^>]*?)\bsrc="([^"]*)"/gi, (m, pre, src) => `<img${pre}src="${localMedia(src.replace(/&amp;/g, '&'), postFile)}"`);

// Marblism (and other tools) may name the fields at the top of a post differently; accept them all.
const pick = (d, ...keys) => keys.map((k) => d[k]).find((v) => v !== undefined && v !== null && v !== '');

async function postFiles(dir) {
  const out = [];
  let entries = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    if (e.isDirectory()) out.push(...await postFiles(p));
    else if (/\.(md|markdown)$/i.test(e.name) && !/^readme\./i.test(e.name)) out.push(p);
  }
  return out.sort();
}

async function loadPosts() {
  const posts = [];
  for (const full of await postFiles(POSTS_DIR)) {
    const file = path.relative(POSTS_DIR, full);
    const { data: raw, content } = matter(await fs.readFile(full, 'utf8'));
    const data = {
      ...raw,
      description: pick(raw, 'description', 'meta_description', 'metaDescription', 'seo_description', 'seoDescription', 'excerpt', 'summary'),
      date: pick(raw, 'date', 'publishedAt', 'published_at', 'pubDate', 'publishDate', 'published_date', 'datePublished'),
      updated: pick(raw, 'updated', 'updatedAt', 'updated_at', 'lastmod', 'modified', 'dateModified'),
      keywords: pick(raw, 'keywords', 'tags', 'categories'),
      image: pick(raw, 'image', 'cover', 'coverImage', 'cover_image', 'featured_image', 'featuredImage', 'heroImage', 'hero_image', 'thumbnail'),
      slug: pick(raw, 'slug', 'permalink'),
    };
    if (raw.draft === true || raw.published === false || /^draft$/i.test(String(raw.status || ''))) continue;
    let body = content.replace(/\r\n/g, '\n');
    let title = data.title;
    const h1 = body.match(/^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\n|$)/);
    if (h1) { title = title || h1[1]; body = body.slice(h1[0].length); }
    let description = data.description || '';
    body = body.replace(/^\s*\**meta description\**\s*:\s*\**\s*(.+?)\s*$/im, (_, d) => { description = description || d; return ''; });
    if (!title) throw new Error(`${file}: no title. Add "title:" at the top, or start the article with "# Your title".`);
    const words = body.split(/\s+/).filter(Boolean).length;
    const published = data.date ? ymd(data.date) : addedOn(full);
    const image = data.image ? localMedia(String(data.image), full) : '';
    if (image && !body.includes(String(data.image))) body = `![${String(title).replace(/[[\]]/g, '')}](<${data.image}>)\n\n` + body;
    const name = path.basename(file).replace(/\.(md|markdown)$/i, '');
    const fromName = /^index$/i.test(name) ? path.basename(path.dirname(full)) : name;
    const plain = marked.parse(body, { gfm: true }).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    posts.push({
      slug: slugify(String(data.slug || fromName).split('/').filter(Boolean).pop()),
      image,
      title: String(title),
      meta_description: String(description).trim(),
      teaser: String(description).trim() || (plain.length > 160 ? plain.slice(0, 157).replace(/\s+\S*$/, '') + '…' : plain),
      published,
      sortKey: data.date instanceof Date ? data.date.toISOString() : published,
      updated: data.updated ? ymd(data.updated) : published,
      read_time: Number(data.read_time) || Math.max(1, Math.round(words / 230)),
      keywords: Array.isArray(data.keywords) ? data.keywords.map(String) : String(data.keywords || '').split(',').map((k) => k.trim()).filter(Boolean),
      content_html: fixImages(headingIds(marked.parse(body, { gfm: true })), full),
    });
  }
  const seen = new Set();
  for (const p of posts) { if (seen.has(p.slug)) throw new Error(`Two posts share the web address "${p.slug}".`); seen.add(p.slug); }
  return posts.sort((a, b) => b.sortKey.localeCompare(a.sortKey) || a.title.localeCompare(b.title));
}

// Article details for Google (BlogPosting), pointing at this blog's real address.
const postLd = (a, canonical) => ({
  '@context': 'https://schema.org', '@type': 'BlogPosting', headline: a.title, description: a.meta_description,
  datePublished: a.published, dateModified: a.updated, inLanguage: SITE_LANG,
  ...(a.keywords.length ? { keywords: a.keywords.join(', ') } : {}),
  ...(a.image ? { image: /^https?:/i.test(a.image) ? a.image : new URL(a.image, BASE_URL).href } : {}),
  url: canonical, mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
  author: { '@type': 'Organization', name: 'REPDBYLOVE', url: SITE },
  publisher: { '@type': 'Organization', name: 'REPDBYLOVE', url: SITE },
  about: { '@type': 'SoftwareApplication', name: 'Loomee', operatingSystem: 'Android', applicationCategory: 'UtilitiesApplication', url: PLAY },
});

// ---- article body: sanitise, table of contents -------------------------------------------
function cleanBody(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'blockquote', 'a', 'strong', 'em', 'code', 'pre', 'br', 'b', 'i', 'hr', 'span', 'img', 'figure', 'figcaption'],
    allowedAttributes: { a: ['href'], h2: ['id'], th: ['colspan'], td: ['colspan'], img: ['src', 'alt', 'title', 'width', 'height', 'loading'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    transformTags: {
      img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, alt: attribs.alt || '', loading: 'lazy' } }),
      a: (tag, attribs) => ({ tagName: 'a', attribs: attribs.href && /^https?:/i.test(attribs.href) && !attribs.href.startsWith(BASE_URL)
        ? { href: attribs.href, target: '_blank', rel: 'noopener' } : attribs }),
    },
  });
}

function buildBody(html) {
  const $ = cheerio.load(`<div id="root">${cleanBody(html)}</div>`, null, false);
  const root = $('#root');
  root.find('table').each((_, t) => { $(t).wrap('<div class="tablewrap"></div>'); });
  const heads = root.find('h2[id]').toArray().filter((h) => $(h).attr('id') !== 'faq');
  if (heads.length >= 3) {
    const links = heads.map((h) => `<li><a href="#${esc($(h).attr('id'))}">${esc($(h).text())}</a></li>`).join('');
    const toc = `<nav class="toc" aria-label="In this article"><h2>In this article</h2><ol>${links}</ol></nav>`;
    const kt = root.find('h2:not([id])').toArray().find((h) => /^\s*key takeaways\s*$/i.test($(h).text()));
    const list = kt ? $(kt).next('ul,ol') : null;
    if (list && list.length) list.after(toc); else root.prepend(toc);
  }
  return root.html();
}

// ---- page shell --------------------------------------------------------------------------
const LOGO = `<svg viewBox="18 18 72 72" aria-hidden="true"><defs><linearGradient id="lr" gradientUnits="userSpaceOnUse" x1="30" y1="30" x2="78" y2="80"><stop offset="0" stop-color="#9152F5"/><stop offset="1" stop-color="#29D9F5"/></linearGradient><linearGradient id="ll" gradientUnits="userSpaceOnUse" x1="47" y1="40" x2="63" y2="66"><stop offset="0" stop-color="#9D5FF8"/><stop offset="1" stop-color="#8744F6"/></linearGradient></defs><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M81.47,51.35A27.6,27.6 0,1 1,61.84 27.54" stroke="url(#lr)" stroke-width="5.1"/><path d="M67.9,34.4Q74.5,37.5 74.7,45.9M71.3,28.3Q80,31 81.5,42.5" stroke="#2ADFF5" stroke-width="3.2"/><path d="M47.2,40.5V65.4H62.8" stroke="url(#ll)" stroke-width="7.6"/></g></svg>`;
const PLAY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 5 3.5"/></svg>`;
const NAV = (current) => `<header class="wrap hdr"><a class="brand" href="${BASE_PATH}/">${LOGO}Loomee <span>Blog</span></a><nav class="links" aria-label="Main"><a href="${APP_PAGE}">About Loomee</a><a href="${BASE_PATH}/"${current ? ' aria-current="page"' : ''}>All articles</a><a class="btn sm" href="${PLAY}" target="_blank" rel="noopener">${PLAY_ICON}Get it on Google Play</a></nav></header>`;
const FOOT = `<footer class="foot"><div class="wrap fwrap"><p>© ${new Date().getUTCFullYear()} REPDBYLOVE · Ontario, Canada</p><nav class="flinks" aria-label="Footer"><a href="${APP_PAGE}">Loomee</a><a href="${SITE}/loomee-privacy">Privacy policy</a><a href="${SITE}/loomee-terms">Terms of use</a><a href="mailto:info@repdbylove.com">info@repdbylove.com</a></nav></div></footer>`;

function shell({ title, desc, type, canonical, head = '', body, robots, current = false }) {
  return `<!doctype html>
<html lang="${SITE_LANG}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${GOOGLE_VERIFY ? `<meta name="google-site-verification" content="${esc(GOOGLE_VERIFY)}">\n` : ''}<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${robots ? `<meta name="robots" content="${robots}">\n` : ''}${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ''}<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Loomee Blog">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">\n` : ''}<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#14151A">
<link rel="alternate" type="application/rss+xml" title="Loomee Blog" href="${BASE_URL}/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style>
${head}</head>
<body>
${NAV(current)}
<main>${body}</main>
${FOOT}
</body>
</html>
`;
}

const ldScript = (ld) => `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n`;
const link = (a) => `${BASE_PATH}/${encodeURIComponent(a.slug)}/`;

function indexPage(items) {
  const hero = `<section class="wrap phero"><p class="eyebrow">The Loomee Blog</p><h1>Notification lights, <span>explained.</span></h1><p>Tips for a calmer phone: LED notification lights, edge lighting, quiet hours and knowing what arrived without picking up your phone.</p></section>`;
  let list;
  if (!items.length) {
    list = `<div class="card notice"><b>No articles yet</b><br>The first one is on its way.</div>`;
  } else {
    list = `<section class="feed" aria-label="Articles">` + items.map((a, i) =>
      `<a class="card entry${i === 0 ? ' first' : ''}" href="${link(a)}">${i === 0 ? `<span class="eyebrow"><span class="dot"></span>&nbsp; Latest</span>` : ''}<h2>${esc(a.title)}</h2>${a.teaser ? `<p>${esc(a.teaser)}</p>` : ''}<span class="meta">${esc(metaLine(a))}</span></a>`).join('\n') + `</section>`;
  }
  return shell({
    title: 'Loomee Blog: LED Notification Light Tips for Android',
    desc: 'Articles from the Loomee team about LED notification lights, edge lighting and a calmer phone on Android.',
    type: 'website', canonical: `${BASE_URL}/`, current: true,
    head: ldScript({ '@context': 'https://schema.org', '@type': 'Blog', name: 'Loomee Blog', url: `${BASE_URL}/`, publisher: { '@type': 'Organization', name: 'REPDBYLOVE', url: SITE } }),
    body: hero + `<div class="wrap">${list}</div>`,
  });
}

const CTA = `<section class="cta" aria-labelledby="cta-h"><p class="eyebrow">Loomee for Android</p><h2 id="cta-h">Bring back your notification light.</h2><p>A soft glow on your lock screen for calls, texts, email and chats. Six shapes, twelve colours, fourteen styles. Know what arrived without picking up your phone.</p><a class="btn" href="${PLAY}" target="_blank" rel="noopener">${PLAY_ICON}Get it on Google Play</a><small>Free to try · Lifetime access is a one-time purchase · No ads</small></section>`;

function articlePage(a) {
  const canonical = `${BASE_URL}/${encodeURIComponent(a.slug)}/`;
  const ogImage = a.image ? `<meta property="og:image" content="${esc(/^https?:/i.test(a.image) ? a.image : new URL(a.image, BASE_URL).href)}">\n` : '';
  const body = `<div class="wrap"><div class="ahero"><a class="back" href="${BASE_PATH}/">&larr; All articles</a><h1>${esc(a.title)}</h1><p class="meta">${esc(metaLine(a))}</p></div>` +
    `<article class="article"><div class="body">${buildBody(a.content_html)}</div>${CTA}</article></div>`;
  return shell({ title: `${a.title} | Loomee Blog`, desc: a.meta_description || a.teaser, type: 'article', canonical, head: ogImage + ldScript(postLd(a, canonical)), body });
}

function notFoundPage() {
  return shell({
    title: 'Article not found | Loomee Blog', desc: 'This article could not be found.', type: 'website', robots: 'noindex',
    body: `<section class="wrap phero"><p class="eyebrow">Blog</p><h1>Article not found</h1><p>It may have been moved or taken down.</p><a class="back" href="${BASE_PATH}/" style="align-self:flex-start">&larr; All articles</a></section>`,
  });
}

function sitemap(items) {
  const url = (loc, last) => `  <url><loc>${esc(loc)}</loc>${last ? `<lastmod>${esc(last)}</lastmod>` : ''}</url>`;
  const newest = items.map((a) => a.updated).filter(Boolean).sort().pop();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [url(`${BASE_URL}/`, newest), ...items.map((a) => url(`${BASE_URL}/${encodeURIComponent(a.slug)}/`, a.updated))].join('\n') + `\n</urlset>\n`;
}

function feed(items) {
  const rfc = (d) => new Date(d + 'T12:00:00Z').toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Loomee Blog</title><link>${BASE_URL}/</link><description>LED notification light tips for Android from the Loomee team.</description><language>en</language>\n` +
    items.slice(0, 30).map((a) => `<item><title>${esc(a.title)}</title><link>${BASE_URL}/${encodeURIComponent(a.slug)}/</link><guid>${BASE_URL}/${encodeURIComponent(a.slug)}/</guid><pubDate>${rfc(a.published)}</pubDate><description>${esc(a.teaser)}</description></item>`).join('\n') +
    `\n</channel></rss>\n`;
}

// ---- run ---------------------------------------------------------------------------------
const articles = await loadPosts(); // a broken post stops the build, so the last good site stays online

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
await fs.cp('assets', path.join(OUT, 'assets'), { recursive: true }).catch(() => {});
for (const rel of MEDIA) {
  await fs.mkdir(path.join(OUT, path.dirname(rel)), { recursive: true });
  await fs.copyFile(rel, path.join(OUT, rel)).catch(() => console.warn(`Warning: picture not found in the repo: ${rel}`));
}
await fs.writeFile(path.join(OUT, 'index.html'), indexPage(articles));
await fs.writeFile(path.join(OUT, '404.html'), notFoundPage());
await fs.writeFile(path.join(OUT, 'sitemap.xml'), sitemap(articles));
await fs.writeFile(path.join(OUT, 'feed.xml'), feed(articles));
await fs.writeFile(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${BASE_URL}/sitemap.xml\n`);
await fs.writeFile(path.join(OUT, '.nojekyll'), '');
await fs.writeFile(path.join(OUT, 'CNAME'), `${new URL(BASE_URL).hostname}\n`);
for (const a of articles) {
  await fs.mkdir(path.join(OUT, a.slug), { recursive: true });
  await fs.writeFile(path.join(OUT, a.slug, 'index.html'), articlePage(a));
}
console.log(`Built ${articles.length} article page(s) + index, sitemap, feed and 404 into ${OUT}/`);
