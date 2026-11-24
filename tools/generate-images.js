#!/usr/bin/env node
/*
 * Generates product photos with the OpenAI image API from the image-shots.csv that the
 * catalog prompt produces (catalog/catalog-prompt.md).
 *
 *   node tools/generate-images.js --products 1            show the plan and cost for the first product
 *   node tools/generate-images.js --products 1 --yes      generate it
 *   node tools/generate-images.js --products all --budget 5 --yes
 *
 * Options:
 *   --shots <file>       shot list (default catalog/image-shots.csv)
 *   --products <n|all>   how many products to include, counted from the top of the shot list (required)
 *   --only <handles>     comma-separated product handles instead of --products
 *   --images <n>         make only the first n images of each product (e.g. 2 skips the back view)
 *   --quality <q>        low, medium or high (default medium)
 *   --model <id>         OpenAI image model (default gpt-image-2)
 *   --budget <usd>       stop before spending more than this in one run (default 0.50)
 *   --parallel <n>       products worked on at the same time (default 2)
 *   --out <dir>          folder for the images (default catalog/images)
 *   --size <WxH>         1024x1536 portrait (default), 1536x1024 landscape or 1024x1024
 *   --yes                actually generate; without it nothing is sent and nothing is spent
 *   --check              only confirm the key works and the model is available (free)
 *
 * The API key is read from the OPENAI_API_KEY environment variable, catalog/.env or .env
 * (a line OPENAI_API_KEY=...). It is never printed.
 *
 * Image 1 of each product is made from its prompt. The other images of that product are made
 * with image 1 as a reference, so the garment stays the same in every photo. Images that already
 * exist in catalog/images are skipped, so a run can be repeated without paying twice: delete an
 * image to have it made again. Every image made is logged with its real cost in
 * catalog/images/generation-log.csv.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = (() => {
  const i = process.argv.indexOf('--out');
  return path.resolve(ROOT, i !== -1 ? process.argv[i + 1] : 'catalog/images');
})();
const LOG_FILE = path.join(OUT_DIR, 'generation-log.csv');
const API = 'https://api.openai.com/v1';
const SIZE = (() => {
  const i = process.argv.indexOf('--size');
  return i !== -1 ? process.argv[i + 1] : '1024x1536';
})();

// USD per 1M tokens (OpenAI pricing, GPT Image 2 family) and per-image output estimates for portrait images.
const RATES = { textIn: 5, imageIn: 8, out: 30 };
const OUTPUT_ESTIMATE = { low: 0.005, medium: 0.041, high: 0.165 };
const REFERENCE_ESTIMATE = 0.015;

// ---------- arguments ----------
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const shotsFile = path.resolve(ROOT, option('shots', 'catalog/image-shots.csv'));
const productsArg = option('products', null);
const onlyArg = option('only', null);
const quality = option('quality', 'medium');
const model = option('model', 'gpt-image-2');
const budget = Number(option('budget', '0.50'));
const parallel = Math.max(1, Number(option('parallel', '2')));
const confirmed = flag('yes');

const fail = (message) => {
  console.error(`\n${message}\n`);
  process.exit(1);
};

if (flag('check')) {
  // Free: confirms the key works and the model is available. Nothing is generated.
  (async () => {
    const key = readKey();
    if (!key) fail('No API key found. Put OPENAI_API_KEY=... on one line in .env or catalog/.env');
    const res = await fetch(`${API}/models/${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${key}` } });
    if (res.status === 401) fail('OpenAI rejected the API key (401). Check the key in .env.');
    if (!res.ok) fail(`The key works, but model "${model}" isn't available to it (${res.status}).`);
    console.log(`\nThe key works and ${model} is available. Nothing was generated or charged.\n`);
  })().catch((error) => fail(error.message));
  return;
}
if (!productsArg && !onlyArg) fail('Say how many products to include, e.g. --products 1 (or --only <handle>).');
if (!OUTPUT_ESTIMATE[quality]) fail('Quality must be low, medium or high.');
if (!(budget > 0)) fail('Budget must be a positive number of US dollars.');
if (!fs.existsSync(shotsFile)) fail(`Shot list not found: ${path.relative(ROOT, shotsFile)}`);

// ---------- shot list ----------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim()));
}

const [headerRow, ...dataRows] = parseCSV(fs.readFileSync(shotsFile, 'utf8'));
const column = (name) => headerRow.findIndex((h) => h.trim().toLowerCase() === name);
const COL = { file: column('file name'), title: column('product title'), shot: column('shot'), prompt: column('image prompt') };
if (COL.file === -1 || COL.prompt === -1) fail('The shot list needs "File name" and "Image prompt" columns.');

const products = new Map();
for (const r of dataRows) {
  const file = r[COL.file].trim();
  const match = file.match(/^([a-z0-9-]+)_(\d+)(?:_[a-z0-9-]+)?\.(jpe?g|png|webp)$/i);
  if (!match) fail(`File name doesn't follow <handle>_<number>.jpg: ${file}`);
  const handle = match[1];
  if (!products.has(handle)) products.set(handle, { handle, title: COL.title !== -1 ? r[COL.title] : handle, shots: [] });
  products.get(handle).shots.push({ file: file.replace(/\.(png|webp|jpeg)$/i, '.jpg'), number: Number(match[2]), shot: COL.shot !== -1 ? r[COL.shot] : '', prompt: r[COL.prompt].trim() });
}
const perProduct = Number(option('images', '0'));
for (const p of products.values()) {
  p.shots.sort((a, b) => a.number - b.number);
  if (perProduct > 0) p.shots = p.shots.slice(0, perProduct);
}

let selected = [...products.values()];
if (onlyArg) {
  const wanted = onlyArg.split(',').map((h) => h.trim());
  const missing = wanted.filter((h) => !products.has(h));
  if (missing.length) fail(`Not in the shot list: ${missing.join(', ')}`);
  selected = wanted.map((h) => products.get(h));
} else if (productsArg !== 'all') {
  const n = Number(productsArg);
  if (!(n > 0)) fail('--products must be a number or "all".');
  selected = selected.slice(0, n);
}

// ---------- plan ----------
fs.mkdirSync(OUT_DIR, { recursive: true });
const exists = (file) => fs.existsSync(path.join(OUT_DIR, file));
const plan = selected.map((p) => ({ ...p, todo: p.shots.filter((s) => !exists(s.file)) }));
const todoCount = plan.reduce((sum, p) => sum + p.todo.length, 0);
const estimateFor = (p) =>
  p.todo.reduce((sum, s) => sum + OUTPUT_ESTIMATE[quality] + (s.number === p.shots[0].number ? 0 : REFERENCE_ESTIMATE), 0);
const estimate = plan.reduce((sum, p) => sum + estimateFor(p), 0);

console.log(`\nShot list: ${path.relative(ROOT, shotsFile)} (${products.size} products)`);
console.log(`Model ${model}, quality ${quality}, size ${SIZE}\n`);
for (const p of plan) {
  const state = p.todo.length ? `${p.todo.length} to make` : 'all done';
  console.log(`  ${p.title} (${p.handle}): ${state}`);
}
console.log(`\nImages to make: ${todoCount}, already made: ${plan.reduce((s, p) => s + p.shots.length, 0) - todoCount}`);
console.log(`Estimated cost: about $${estimate.toFixed(2)}. Spending limit for this run: $${budget.toFixed(2)}`);
if (estimate > budget) console.log(`The run will stop when it reaches the limit. Raise it with --budget ${Math.ceil(estimate * 1.2)} to make them all.`);

if (!todoCount) process.exit(0);
if (!confirmed) {
  console.log('\nNothing was generated. Add --yes to generate these images.\n');
  process.exit(0);
}

// ---------- API ----------
function readKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  for (const envFile of [path.join(ROOT, 'catalog', '.env'), path.join(ROOT, '.env')]) {
    if (!fs.existsSync(envFile)) continue;
    const line = fs.readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => /^\s*(export\s+)?OPENAI_API_KEY\s*=/.test(l));
    if (line) return line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  }
  return '';
}
const KEY = readKey();
if (!KEY) fail('No API key. Put OPENAI_API_KEY=... on one line in catalog/.env');

class StopError extends Error {}

async function call(endpoint, body) {
  for (let attempt = 1; ; attempt += 1) {
    const isForm = body instanceof FormData;
    const res = await fetch(`${API}${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, ...(isForm ? {} : { 'Content-Type': 'application/json' }) },
      body: isForm ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch (e) {
      // keep the raw text for the error message
    }
    if (res.ok) return json;
    const message = (json.error && json.error.message) || text.slice(0, 300);
    if (res.status === 401) throw new StopError(`OpenAI rejected the API key (401). Check catalog/.env.`);
    if (res.status === 403) throw new StopError(`OpenAI refused access (403): ${message}\nYour organization may need verifying at platform.openai.com > Settings > Organization.`);
    if (res.status === 429 && /quota|billing|credit/i.test(message)) throw new StopError(`OpenAI says the account has no credit left: ${message}`);
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const wait = 5000 * attempt;
      console.log(`    OpenAI is busy (${res.status}), retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(`${res.status}: ${message}`);
  }
}

const costOf = (usage) => {
  if (!usage) return null;
  const details = usage.input_tokens_details || {};
  const imageIn = details.image_tokens || 0;
  const textIn = details.text_tokens != null ? details.text_tokens : Math.max(0, (usage.input_tokens || 0) - imageIn);
  return (textIn * RATES.textIn + imageIn * RATES.imageIn + (usage.output_tokens || 0) * RATES.out) / 1e6;
};

const KEEP_SAME =
  'Use the reference image: show exactly the same garment, with the same cut, fabric, color, buttons and details. Same studio background and lighting.';

let spent = 0;
let reserved = 0;
let made = 0;
let failed = 0;
let stopped = null;
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, 'time,file,model,quality,input_tokens,output_tokens,cost_usd\n');

async function makeImage(p, s, reference) {
  const next = OUTPUT_ESTIMATE[quality] + (reference ? REFERENCE_ESTIMATE : 0);
  if (spent + reserved + next > budget) {
    stopped = stopped || `Stopped at the $${budget.toFixed(2)} spending limit.`;
    return false;
  }
  reserved += next;
  try {
    return await requestImage(s, reference, next);
  } finally {
    reserved -= next;
  }
}

async function requestImage(s, reference, next) {
  let data;
  if (reference) {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', `${KEEP_SAME} ${s.prompt}`);
    form.append('size', SIZE);
    form.append('quality', quality);
    form.append('output_format', 'jpeg');
    form.append('n', '1');
    form.append('image[]', new Blob([fs.readFileSync(reference)], { type: 'image/jpeg' }), path.basename(reference));
    data = await call('/images/edits', form);
  } else {
    data = await call('/images/generations', { model, prompt: s.prompt, size: SIZE, quality, output_format: 'jpeg', n: 1 });
  }
  const image = data.data && data.data[0] && data.data[0].b64_json;
  if (!image) throw new Error('OpenAI returned no image');
  fs.writeFileSync(path.join(OUT_DIR, s.file), Buffer.from(image, 'base64'));
  const cost = costOf(data.usage);
  spent += cost != null ? cost : next;
  made += 1;
  const u = data.usage || {};
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()},${s.file},${model},${quality},${u.input_tokens || ''},${u.output_tokens || ''},${cost != null ? cost.toFixed(4) : ''}\n`);
  console.log(`    made ${s.file}  $${(cost != null ? cost : next).toFixed(3)}${cost == null ? ' (estimated)' : ''}  total $${spent.toFixed(2)}`);
  return true;
}

async function runProduct(p) {
  if (stopped || !p.todo.length) return;
  console.log(`  ${p.title}`);
  const first = p.shots[0];
  const firstPath = path.join(OUT_DIR, first.file);
  try {
    if (!exists(first.file) && !(await makeImage(p, first, null))) return;
    for (const s of p.shots.slice(1)) {
      if (stopped) return;
      if (exists(s.file)) continue;
      if (!(await makeImage(p, s, firstPath))) return;
    }
  } catch (error) {
    if (error instanceof StopError) {
      stopped = error.message;
      return;
    }
    failed += 1;
    console.log(`    could not make an image for ${p.handle}: ${error.message}`);
  }
}

(async () => {
  // Free check that the model exists for this key before anything is spent.
  const check = await fetch(`${API}/models/${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (check.status === 401) fail('OpenAI rejected the API key (401). Check catalog/.env.');
  if (!check.ok) fail(`Model "${model}" isn't available to this key (${check.status}). Try --model with another image model.`);

  console.log('');
  const queue = [...plan];
  await Promise.all(
    Array.from({ length: Math.min(parallel, queue.length) }, async () => {
      while (queue.length && !stopped) await runProduct(queue.shift());
    })
  );
  console.log(`\nMade ${made} images for $${spent.toFixed(2)}.${failed ? ` ${failed} product(s) had an error; run again to retry them.` : ''}`);
  if (stopped) console.log(stopped);
  console.log(`Images are in ${path.relative(ROOT, OUT_DIR)}. Costs are logged in ${path.relative(ROOT, LOG_FILE)}.\n`);
  if (stopped && !made) process.exit(1);
})().catch((error) => fail(error.message));
