#!/usr/bin/env node
/*
 * Puts the images from catalog/images on their products in Shopify.
 * File names are <handle>_<number>.jpg (as in catalog/image-shots.csv); the handle finds the product.
 *
 *   node tools/upload-images.js                    show what would be uploaded
 *   node tools/upload-images.js --yes              upload
 *
 * Options:
 *   --only <handles>   comma-separated product handles
 *   --order <list>     display order by image number (default 2,1,3: the model photo first, then
 *                      the front view, which shows on hover in product cards, then the back view)
 *   --replace          replace images a product already has (otherwise such products are skipped)
 *   --yes              actually upload
 *
 * Alt text comes from the product title and the Shot column of the shot list.
 */
const fs = require('fs');
const path = require('path');
const { execute, userErrors, stageAndUpload, readCSV, STORE } = require('./lib/shopify');

const ROOT = path.resolve(__dirname, '..');
const IMAGES = path.join(ROOT, 'catalog', 'images');
const SHOTS = path.join(ROOT, 'catalog', 'image-shots.csv');
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const order = option('order', '2,1,3').split(',').map(Number);
const only = option('only', null);
const replace = args.includes('--replace');
const confirmed = args.includes('--yes');

const shotInfo = new Map(fs.existsSync(SHOTS) ? readCSV(SHOTS).map((r) => [r['File name'], r]) : []);
const altFor = (file, title) => {
  const shot = (shotInfo.get(file) || {}).Shot || '';
  const view = /model/i.test(shot) ? 'worn by a model' : shot.toLowerCase() || 'product photo';
  return `${title}, ${view}`;
};

(async () => {
  const groups = new Map();
  for (const file of fs.readdirSync(IMAGES).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))) {
    const m = file.match(/^([a-z0-9-]+)_(\d+)(?:_[a-z0-9-]+)?\.\w+$/i);
    if (!m) continue;
    if (!groups.has(m[1])) groups.set(m[1], []);
    groups.get(m[1]).push({ file, number: Number(m[2]) });
  }
  let handles = [...groups.keys()];
  if (only) handles = only.split(',').map((h) => h.trim()).filter((h) => groups.has(h));
  const rank = (n) => (order.includes(n) ? order.indexOf(n) : order.length + n);

  const plan = [];
  console.log(`\nStore: ${STORE}\n`);
  for (const handle of handles) {
    const data = await execute(`query($h: String!) { productByIdentifier(identifier: { handle: $h }) { id title media(first: 50) { nodes { id } } } }`, { h: handle });
    const product = data.productByIdentifier;
    const images = groups.get(handle).sort((a, b) => rank(a.number) - rank(b.number));
    if (!product) {
      console.log(`  ${handle}: no product with this handle, skipped`);
      continue;
    }
    const existing = product.media.nodes.map((n) => n.id);
    if (existing.length && !replace) {
      console.log(`  ${product.title}: already has ${existing.length} images, skipped (use --replace to swap them)`);
      continue;
    }
    console.log(`  ${product.title}: ${images.map((i) => i.file).join(', ')}${existing.length ? ` (replacing ${existing.length})` : ''}`);
    plan.push({ product, images, existing });
  }
  if (!plan.length) return console.log('\nNothing to upload.\n');
  if (!confirmed) return console.log('\nNothing was uploaded. Add --yes to upload.\n');

  const files = plan.flatMap((p) => p.images.map((i) => path.join(IMAGES, i.file)));
  console.log(`\nUploading ${files.length} images`);
  const urls = await stageAndUpload(files, (done, total) => console.log(`  ${done}/${total}`));
  let k = 0;
  for (const p of plan) {
    if (p.existing.length) {
      const del = await execute(`mutation($ids: [ID!]!) { fileDelete(fileIds: $ids) { userErrors { field message } } }`, { ids: p.existing }, true);
      userErrors(del, 'fileDelete');
    }
    const media = p.images.map((i) => ({ originalSource: urls[k++], alt: altFor(i.file, p.product.title), mediaContentType: 'IMAGE' }));
    const res = await execute(
      `mutation($product: ProductUpdateInput!, $media: [CreateMediaInput!]) { productUpdate(product: $product, media: $media) { product { id } userErrors { field message } } }`,
      { product: { id: p.product.id }, media },
      true
    );
    userErrors(res, 'productUpdate');
    console.log(`  added ${media.length} images to ${p.product.title}`);
  }
  console.log('\nDone. Shopify takes a few seconds to process new images.\n');
})().catch((error) => {
  console.error(`\n${error.message.split('\n').filter((l) => !l.startsWith('{"type"')).join('\n').slice(0, 1500)}\n`);
  process.exit(1);
});
