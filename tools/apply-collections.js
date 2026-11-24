#!/usr/bin/env node
/*
 * Creates or updates the store's collections from catalog/collections.csv
 * (columns Title, Handle, Description, Rule), as produced by catalog/catalog-prompt.md.
 *
 *   node tools/apply-collections.js          show what would change
 *   node tools/apply-collections.js --yes    apply it
 *
 * Rules understood:
 *   tag = <tag>                   products with that tag
 *   all products, newest first    every product, newest first
 *   compare-at price is set       products on sale
 *
 * Existing collections are updated in place (same handle, so menus and theme sections keep
 * pointing at them); missing ones are created as automated collections and published to the
 * Online Store.
 */
const path = require('path');
const { execute, userErrors, readCSV, STORE } = require('./lib/shopify');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : 'catalog/collections.csv';
const file = path.resolve(ROOT, fileArg);
const confirmed = args.includes('--yes');

const escapeHTML = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function parseRule(rule) {
  const tag = rule.match(/^tag\s*=\s*(.+)$/i);
  if (tag) return { label: `tag = ${tag[1].trim()}`, rules: [{ column: 'TAG', relation: 'EQUALS', condition: tag[1].trim() }], sort: 'BEST_SELLING' };
  if (/all products/i.test(rule)) return { label: 'all products, newest first', rules: [{ column: 'VARIANT_PRICE', relation: 'GREATER_THAN', condition: '0' }], sort: 'CREATED_DESC', forceSort: true };
  if (/compare.?at/i.test(rule)) return { label: 'on sale', rules: [{ column: 'IS_PRICE_REDUCED', relation: 'IS_SET', condition: '' }], sort: 'BEST_SELLING' };
  throw new Error(`Rule not understood: "${rule}"`);
}

const sameRules = (a, b) =>
  a && a.rules.length === b.length && a.rules.every((r, i) => r.column === b[i].column && r.relation === b[i].relation && String(r.condition) === String(b[i].condition));

(async () => {
  const rows = readCSV(file);
  const data = await execute(`{
    collections(first: 250) { nodes { id handle title descriptionHtml sortOrder ruleSet { appliedDisjunctively rules { column relation condition } } } }
    publications(first: 20) { nodes { id name } }
  }`);
  const existing = new Map(data.collections.nodes.map((c) => [c.handle, c]));
  const onlineStore = data.publications.nodes.find((p) => /online store/i.test(p.name));

  const plan = rows.map((row) => {
    const rule = parseRule(row.Rule);
    const current = existing.get(row.Handle);
    const descriptionHtml = `<p>${escapeHTML(row.Description)}</p>`;
    const input = { title: row.Title, descriptionHtml };
    const changes = [];
    if (!current || current.title !== row.Title) changes.push('title');
    if (!current || current.descriptionHtml !== descriptionHtml) changes.push('description');
    if (!current || !sameRules(current.ruleSet, rule.rules)) {
      input.ruleSet = { appliedDisjunctively: false, rules: rule.rules };
      changes.push(`rule (${rule.label})`);
    }
    const keepSort = current && !rule.forceSort && !['MANUAL', 'MOST_RELEVANT'].includes(current.sortOrder);
    const sortOrder = keepSort ? current.sortOrder : rule.sort;
    if (!current || current.sortOrder !== sortOrder) {
      input.sortOrder = sortOrder;
      changes.push(`sort (${sortOrder.toLowerCase().replace('_', ' ')})`);
    }
    return { row, current, input, changes };
  });

  console.log(`\nStore: ${STORE}\n`);
  for (const p of plan) {
    const what = p.current ? (p.changes.length ? `update ${p.changes.join(', ')}` : 'already up to date') : `create (${p.changes.filter((c) => c.startsWith('rule')).join('')})`;
    console.log(`  ${p.row.Title} (${p.row.Handle}): ${what}`);
  }
  const todo = plan.filter((p) => !p.current || p.changes.length);
  if (!todo.length) return console.log('\nNothing to change.\n');
  if (!confirmed) return console.log('\nNothing was changed. Add --yes to apply.\n');

  console.log('');
  for (const p of todo) {
    if (p.current) {
      const res = await execute(
        `mutation($input: CollectionInput!) { collectionUpdate(input: $input) { collection { id } userErrors { field message } } }`,
        { input: { id: p.current.id, ...p.input } },
        true
      );
      userErrors(res, 'collectionUpdate');
      console.log(`  updated ${p.row.Handle}`);
    } else {
      const res = await execute(
        `mutation($input: CollectionInput!) { collectionCreate(input: $input) { collection { id handle } userErrors { field message } } }`,
        { input: { handle: p.row.Handle, ...p.input } },
        true
      );
      const created = userErrors(res, 'collectionCreate').collection;
      if (onlineStore) {
        const pub = await execute(
          `mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }`,
          { id: created.id, input: [{ publicationId: onlineStore.id }] },
          true
        );
        userErrors(pub, 'publishablePublish');
      }
      console.log(`  created ${created.handle}${onlineStore ? ' and published it to the Online Store' : ''}`);
    }
  }
  console.log('\nDone. Automated collections take a minute to fill.\n');
})().catch((error) => {
  console.error(`\n${error.message}\n`);
  process.exit(1);
});
