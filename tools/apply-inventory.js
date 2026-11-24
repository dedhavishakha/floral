#!/usr/bin/env node
/*
 * Sets stock levels from catalog/products.csv (Shopify product CSV), matched by SKU.
 * Shopify's CSV import sometimes leaves quantities at 0; this fixes that.
 *
 *   node tools/apply-inventory.js          show what would change
 *   node tools/apply-inventory.js --yes    apply it
 *
 * For every variant whose SKU is in the file it sets the "available" quantity at the variant's
 * stock location, turns on inventory tracking, and sets "continue selling when out of stock".
 */
const path = require('path');
const { execute, userErrors, readCSV, STORE } = require('./lib/shopify');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : 'catalog/products.csv';
const confirmed = args.includes('--yes');

const VARIANTS = `query($cursor: String) {
  productVariants(first: 250, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id sku inventoryQuantity inventoryPolicy
      product { id handle }
      inventoryItem { id tracked inventoryLevels(first: 1) { nodes { location { id } } } }
    }
  }
}`;

(async () => {
  const rows = readCSV(path.resolve(ROOT, fileArg)).filter((r) => r.SKU);
  const wanted = new Map(rows.map((r) => [r.SKU, r]));

  const variants = [];
  let cursor = null;
  do {
    const data = await execute(VARIANTS, { cursor });
    variants.push(...data.productVariants.nodes);
    cursor = data.productVariants.pageInfo.hasNextPage ? data.productVariants.pageInfo.endCursor : null;
  } while (cursor);

  const quantityChanges = [];
  const trackingChanges = [];
  const policyChanges = new Map();
  let matched = 0;
  for (const v of variants) {
    const row = wanted.get(v.sku);
    if (!row) continue;
    matched += 1;
    const quantity = Number(row['Inventory quantity'] || row['Variant Inventory Qty'] || 0);
    const policy = /continue|true|yes/i.test(row['Continue selling when out of stock'] || row['Variant Inventory Policy'] || '') ? 'CONTINUE' : 'DENY';
    const level = v.inventoryItem.inventoryLevels.nodes[0];
    if (!v.inventoryItem.tracked) trackingChanges.push(v);
    if (v.inventoryPolicy !== policy) {
      if (!policyChanges.has(v.product.id)) policyChanges.set(v.product.id, []);
      policyChanges.get(v.product.id).push({ id: v.id, inventoryPolicy: policy });
    }
    if (v.inventoryQuantity !== quantity) {
      if (!level) {
        console.log(`  ${v.sku} isn't stocked at any location; skipped`);
        continue;
      }
      quantityChanges.push({ inventoryItemId: v.inventoryItem.id, locationId: level.location.id, quantity, sku: v.sku, from: v.inventoryQuantity });
    }
  }

  console.log(`\nStore: ${STORE}`);
  console.log(`SKUs in the file: ${wanted.size}, found in the store: ${matched}`);
  console.log(`Quantities to set: ${quantityChanges.length}`);
  console.log(`Tracking to turn on: ${trackingChanges.length}`);
  console.log(`"Continue selling" to change: ${[...policyChanges.values()].flat().length}`);
  quantityChanges.slice(0, 5).forEach((c) => console.log(`  e.g. ${c.sku}: ${c.from} -> ${c.quantity}`));
  if (!quantityChanges.length && !trackingChanges.length && !policyChanges.size) return console.log('\nNothing to change.\n');
  if (!confirmed) return console.log('\nNothing was changed. Add --yes to apply.\n');

  for (const v of trackingChanges) {
    const res = await execute(
      `mutation($id: ID!, $input: InventoryItemInput!) { inventoryItemUpdate(id: $id, input: $input) { userErrors { field message } } }`,
      { id: v.inventoryItem.id, input: { tracked: true } },
      true
    );
    userErrors(res, 'inventoryItemUpdate');
  }
  for (const [productId, list] of policyChanges) {
    const res = await execute(
      `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } } }`,
      { productId, variants: list },
      true
    );
    userErrors(res, 'productVariantsBulkUpdate');
  }
  for (let i = 0; i < quantityChanges.length; i += 100) {
    const batch = quantityChanges.slice(i, i + 100);
    const res = await execute(
      `mutation($input: InventorySetQuantitiesInput!, $key: String!) { inventorySetQuantities(input: $input) @idempotent(key: $key) { userErrors { field message code } } }`,
      {
        key: require('crypto').randomUUID(),
        input: {
          name: 'available',
          reason: 'correction',
          quantities: batch.map(({ inventoryItemId, locationId, quantity, from }) => ({ inventoryItemId, locationId, quantity, changeFromQuantity: from })),
        },
      },
      true
    );
    userErrors(res, 'inventorySetQuantities');
    console.log(`  set ${Math.min(i + 100, quantityChanges.length)}/${quantityChanges.length} quantities`);
  }
  console.log('\nDone.\n');
})().catch((error) => {
  console.error(`\n${error.message.split('\n').filter((l) => !l.startsWith('{"type"')).join('\n').slice(0, 1500)}\n`);
  process.exit(1);
});
