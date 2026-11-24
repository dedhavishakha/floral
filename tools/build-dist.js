#!/usr/bin/env node
/*
 * Builds a clean, store-independent copy of the theme for buyers.
 *
 *   node tools/build-dist.js
 *
 * Writes dist/<theme-name>-<version>.zip, ready to upload in Shopify admin > Online Store > Themes.
 *
 * The copy keeps all demo text and layout, but removes everything that only exists in the
 * demo store: picked products and collections, uploaded images and videos, pages, blogs,
 * links to store resources and campaign dates. Sections fall back to their built-in
 * placeholders until the buyer picks their own content. The newsletter popup and the header
 * countdown ship switched off, and the theme starts on the "Modern Apparel" preset.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'theme-dist-build'));
const THEME_DIRS = ['assets', 'blocks', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
const RESOURCE_TYPES = new Set(['product', 'collection', 'product_list', 'collection_list', 'page', 'blog', 'article', 'video', 'image_picker', 'metaobject', 'metaobject_list']);
const DATE_SETTINGS = new Set(['countdown_end', 'end_date']);
const DEFAULT_PRESET = 'Modern Apparel';

const header = (raw) => (raw.match(/^\/\*[\s\S]*?\*\/\s*/) || [''])[0];
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\/\*[\s\S]*?\*\/\s*/, ''));
const readSchema = (file) => {
  const match = fs.readFileSync(file, 'utf8').match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
  return match ? JSON.parse(match[1]) : {};
};
const typeMap = (settings = []) => Object.fromEntries(settings.filter((s) => s.id).map((s) => [s.id, s.type]));

const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
};

const cleanText = (value) =>
  value
    .replace(/shopify:\/\/collections\/(?!all\b)[\w-]+/g, 'shopify://collections/all')
    .replace(/shopify:\/\/(products|pages|blogs)\/[\w\/-]+/g, 'shopify://collections/all');

const report = { removed: 0, links: 0, dates: 0 };

const cleanSettings = (settings, types) => {
  if (!settings) return;
  for (const [key, value] of Object.entries(settings)) {
    const type = types[key];
    if (RESOURCE_TYPES.has(type)) {
      delete settings[key];
      report.removed += 1;
    } else if (DATE_SETTINGS.has(key) && value) {
      settings[key] = '';
      report.dates += 1;
    } else if (typeof value === 'string' && /^shopify:\/\/(shop_images|files)\//.test(value)) {
      delete settings[key];
      report.removed += 1;
    } else if (type === 'url' && typeof value === 'string' && value.startsWith('shopify://')) {
      if (value.startsWith('shopify://collections/')) {
        if (value !== 'shopify://collections/all') report.links += 1;
        settings[key] = 'shopify://collections/all';
      } else {
        delete settings[key];
        report.removed += 1;
      }
    } else if (typeof value === 'string' && value.includes('shopify://')) {
      const cleaned = cleanText(value);
      if (cleaned !== value) report.links += 1;
      settings[key] = cleaned;
    }
  }
};

const cleanBlocks = (blocks, blockSchemas, themeBlocks) => {
  for (const block of Object.values(blocks || {})) {
    const schema = (blockSchemas || []).find((b) => b.type === block.type) || themeBlocks[block.type] || {};
    cleanSettings(block.settings, typeMap(schema.settings));
    if (block.blocks) cleanBlocks(block.blocks, schema.blocks, themeBlocks);
  }
};

// 1. Copy the theme folders
fs.rmSync(OUT, { recursive: true, force: true });
for (const dir of THEME_DIRS) copyDir(path.join(ROOT, dir), path.join(OUT, dir));

// 2. Load schemas
const sectionSchemas = {};
for (const file of fs.readdirSync(path.join(OUT, 'sections')).filter((f) => f.endsWith('.liquid'))) {
  sectionSchemas[file.replace('.liquid', '')] = readSchema(path.join(OUT, 'sections', file));
}
const themeBlocks = {};
for (const file of fs.readdirSync(path.join(OUT, 'blocks')).filter((f) => f.endsWith('.liquid'))) {
  themeBlocks[file.replace('.liquid', '')] = readSchema(path.join(OUT, 'blocks', file));
}

// 3. Clean templates and section groups
const jsonFiles = [];
const collect = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.name.endsWith('.json')) jsonFiles.push(full);
  }
};
collect(path.join(OUT, 'templates'));
jsonFiles.push(path.join(OUT, 'sections', 'header-group.json'), path.join(OUT, 'sections', 'footer-group.json'));

for (const file of jsonFiles) {
  const raw = fs.readFileSync(file, 'utf8');
  const data = readJSON(file);
  for (const section of Object.values(data.sections || {})) {
    const schema = sectionSchemas[section.type] || {};
    cleanSettings(section.settings, typeMap(schema.settings));
    cleanBlocks(section.blocks, schema.blocks, themeBlocks);
    if (section.type === 'header' && section.settings) section.settings.countdown_show = false;
    if (section.type === 'newsletter-popup' && section.settings) section.settings.enable = false;
  }
  fs.writeFileSync(file, header(raw) + JSON.stringify(data, null, 2) + '\n');
}

// 4. Theme settings: start on the default preset and clean preset references
const settingsFile = path.join(OUT, 'config', 'settings_data.json');
const settingsRaw = fs.readFileSync(settingsFile, 'utf8');
const settingsData = readJSON(settingsFile);
const globalTypes = typeMap(readJSON(path.join(OUT, 'config', 'settings_schema.json')).flatMap((group) => group.settings || []));
for (const preset of Object.values(settingsData.presets || {})) cleanSettings(preset, globalTypes);
if (!settingsData.presets || !settingsData.presets[DEFAULT_PRESET]) throw new Error(`Preset "${DEFAULT_PRESET}" not found`);
settingsData.current = DEFAULT_PRESET;
fs.writeFileSync(settingsFile, header(settingsRaw) + JSON.stringify(settingsData, null, 2) + '\n');

// 5. Final check: nothing store-specific may remain
const leftovers = [];
for (const file of [...jsonFiles, settingsFile]) {
  const text = fs.readFileSync(file, 'utf8');
  const hits = text.match(/shopify:\/\/(shop_images|files|products|pages|blogs)\/[^"\\]*|shopify:\/\/collections\/(?!all\b)[\w-]+/g);
  if (hits) leftovers.push(`${path.relative(OUT, file)}: ${[...new Set(hits)].join(', ')}`);
}
if (leftovers.length) {
  console.error('Store references left behind:\n' + leftovers.join('\n'));
  process.exit(1);
}

// 6. Zip it
const info = readJSON(path.join(OUT, 'config', 'settings_schema.json')).find((group) => group.name === 'theme_info') || {};
const slug = String(info.theme_name || 'theme').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const zipPath = path.join(ROOT, 'dist', `${slug}-${info.theme_version || '0.0.0'}.zip`);
fs.mkdirSync(path.dirname(zipPath), { recursive: true });
fs.rmSync(zipPath, { force: true });
if (process.platform === 'win32') {
  const tar = path.join(process.env.SystemRoot || 'C:\Windows', 'System32', 'tar.exe');
  execFileSync(tar, ['-a', '-c', '-f', zipPath, '-C', OUT, ...THEME_DIRS], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-rq', zipPath, ...THEME_DIRS], { cwd: OUT, stdio: 'inherit' });
}

console.log(`Clean theme written to ${OUT}`);
console.log(`Zip ready: ${zipPath}`);
console.log(`Removed ${report.removed} store-specific picks, rewrote ${report.links} links, cleared ${report.dates} campaign dates.`);
