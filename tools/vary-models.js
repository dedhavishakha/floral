#!/usr/bin/env node
/*
 * Gives each product in catalog/image-shots.csv its own model by replacing the shared model
 * description in the on-model prompts. Products take the models below in turn.
 * Edit the MODELS list, or the prompts in the CSV, to change who wears what.
 *
 *   node tools/vary-models.js
 */
const fs = require('fs');
const path = require('path');
const { readCSV } = require('./lib/shopify');

const FILE = path.resolve(__dirname, '..', 'catalog', 'image-shots.csv');
const SHARED = 'A woman in her late 20s with natural makeup, a relaxed neutral expression and minimal styling';
const MODELS = [
  'A South Asian woman in her late 20s with long straight dark hair worn loose, natural makeup, a soft relaxed expression and minimal styling',
  'A woman in her early 30s with warm brown skin and a short dark curly bob, natural makeup, a calm expression and minimal styling',
  'A South Asian woman in her mid 30s with dark hair in a low bun, minimal makeup, a confident relaxed expression and minimal styling',
  'A woman in her late 20s with fair skin and shoulder-length light brown wavy hair, natural makeup, a gentle expression and minimal styling',
  'An East Asian woman in her late 20s with a sleek black bob, natural makeup, a serene expression and minimal styling',
  'A South Asian woman in her early 40s with shoulder-length dark hair touched with grey, natural makeup, a warm expression and minimal styling',
  'A Black woman in her early 30s with natural hair in a low puff, natural makeup, a relaxed expression and minimal styling',
  'A woman in her mid 20s with long auburn hair in a loose braid and light freckles, natural makeup, a soft expression and minimal styling',
];

const rows = readCSV(FILE);
const header = Object.keys(rows[0]);
const handles = [...new Set(rows.map((r) => r['File name'].split('_')[0]))];
let changed = 0;
for (const r of rows) {
  if (!r['Image prompt'].includes(SHARED)) continue;
  const model = MODELS[handles.indexOf(r['File name'].split('_')[0]) % MODELS.length];
  r['Image prompt'] = r['Image prompt'].replace(SHARED, model);
  changed += 1;
}
const cell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
fs.writeFileSync(FILE, [header.join(','), ...rows.map((r) => header.map((h) => cell(r[h])).join(','))].join('\n') + '\n');
console.log(`Gave ${changed} on-model prompts their own model (${MODELS.length} models in turn).`);
