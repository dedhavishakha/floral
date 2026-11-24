/*
 * Small helpers for the catalog tools: run Admin GraphQL through the Shopify CLI
 * (`shopify store execute`, using the CLI's own login) and upload files with staged uploads.
 *
 * The store comes from the SHOPIFY_STORE environment variable, or --store <domain> on the command line.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const argStore = (() => {
  const i = process.argv.indexOf('--store');
  return i !== -1 ? process.argv[i + 1] : null;
})();
const STORE = argStore || process.env.SHOPIFY_STORE || 'appsy-testt.myshopify.com';

function cliEntry() {
  const candidates = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules', '@shopify', 'cli', 'bin', 'run.js'),
    '/usr/local/lib/node_modules/@shopify/cli/bin/run.js',
    '/opt/homebrew/lib/node_modules/@shopify/cli/bin/run.js',
  ].filter(Boolean);
  return candidates.find((c) => fs.existsSync(c)) || null;
}

function execute(query, variables, mutate = false) {
  const entry = cliEntry();
  const [cmd, base] = entry ? [process.execPath, [entry]] : ['shopify', []];
  const args = [...base, 'store', 'execute', '--store', STORE, '--json', '--query', query];
  if (variables) args.push('--variables', JSON.stringify(variables));
  if (mutate) args.push('--allow-mutations');
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 256 * 1024 * 1024, shell: !entry, env: { ...process.env, SHOPIFY_FLAG_NO_COLOR: '1' } }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${err.message}\n${stdout}\n${stderr}`.slice(0, 2000)));
      const text = String(stdout);
      try {
        const parsed = JSON.parse(text.slice(text.indexOf('{')));
        resolve(parsed.data || parsed);
      } catch (e) {
        reject(new Error(`Could not read the Shopify CLI output: ${text.slice(0, 500)}`));
      }
    });
  });
}

function userErrors(payload, name) {
  const p = payload[name];
  if (p && p.userErrors && p.userErrors.length) {
    throw new Error(`${name}: ${p.userErrors.map((e) => `${(e.field || []).join('.')} ${e.message}`.trim()).join('; ')}`);
  }
  return p;
}

const STAGED = `mutation Staged($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets { url resourceUrl parameters { name value } }
    userErrors { field message }
  }
}`;

const mimeOf = (file) => (/\.png$/i.test(file) ? 'image/png' : /\.webp$/i.test(file) ? 'image/webp' : 'image/jpeg');

/** Uploads local image files and returns their staged resource URLs (in the same order). */
async function stageAndUpload(files, onProgress) {
  const results = [];
  for (let i = 0; i < files.length; i += 20) {
    const chunk = files.slice(i, i + 20);
    const input = chunk.map((f) => ({
      resource: 'IMAGE',
      filename: path.basename(f),
      mimeType: mimeOf(f),
      httpMethod: 'POST',
      fileSize: String(fs.statSync(f).size),
    }));
    const data = await execute(STAGED, { input }, true);
    const payload = userErrors(data, 'stagedUploadsCreate');
    await Promise.all(
      payload.stagedTargets.map(async (target, k) => {
        const form = new FormData();
        for (const p of target.parameters) form.append(p.name, p.value);
        form.append('file', new Blob([fs.readFileSync(chunk[k])], { type: input[k].mimeType }), input[k].filename);
        const res = await fetch(target.url, { method: 'POST', body: form });
        if (!res.ok) throw new Error(`Upload failed for ${chunk[k]}: ${res.status} ${(await res.text()).slice(0, 300)}`);
        results[i + k] = target.resourceUrl;
      })
    );
    if (onProgress) onProgress(Math.min(i + 20, files.length), files.length);
  }
  return results;
}

/** Minimal CSV parser (quoted fields, doubled quotes, newlines inside quotes). Returns objects keyed by header. */
function readCSV(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
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
  const [header, ...data] = rows.filter((r) => r.some((cell) => cell.trim()));
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] || '').trim()])));
}

module.exports = { execute, userErrors, stageAndUpload, readCSV, STORE };
