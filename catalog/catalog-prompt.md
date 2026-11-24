# Catalog prompt for Claude

How to use it:

1. In Shopify admin, go to **Products → Export**, choose **All products** and **Plain CSV file**, and export. Attach that file in the Claude chat. Claude copies its column headers, so the new file imports cleanly.
2. Fill in the brackets under **My store** below.
3. Paste everything below the line into Claude.

---

You are building the product catalog for a Shopify clothing store that uses the "Modern Fashion" theme. Create realistic, original demo products and deliver them as files I can import.

## My store

- Store or brand name: [e.g. Elysian Thread]
- What we sell: [e.g. women's linen and natural-fibre clothing]
- Customer and style: [e.g. women 25–45; calm, minimal, earthy neutral colors]
- Number of products: [e.g. 25]
- Categories, with about how many products in each: [e.g. Tops & Blouses 7, Trousers 5, Dresses 4, Sets & Loungewear 5, Knitwear & Layers 4]
- Curated edits (themed collections shown on the homepage), 3–5 of them: [e.g. The Executive Foundation, Quiet Afternoon Silhouettes, Soft Evening Layers, Polished Daytime Structures]
- Sizes: [e.g. XS, S, M, L, XL]
- Color palette: [e.g. Ivory, Oat, Sand, Taupe, Clay, Camel, Stone, Slate, Espresso]
- Currency and price range: [e.g. INR, 2,490 to 24,990]
- Brands: [one brand, our own name] or [several brands: invent 6 fictional brand names]
- Share of products on sale: [e.g. 25%]
- Model for the on-model photos: [e.g. one consistent female model in her late 20s, natural makeup, relaxed neutral expression, minimal styling]

## Files to deliver

Build every file with code (for example a Python script) instead of typing rows by hand, so all rows stay consistent. Give each one as a downloadable file. If you can't create files, print each file in a code block, 20 products at a time, and wait for me to say "continue".

### 1. products.csv: Shopify product import

- Use exactly the column headers of the attached Shopify export, in the same order. If no file is attached, use the headers of Shopify's current product CSV import template.
- One row per variant. The first row of a product holds all product fields. Each following row of that product repeats only the URL handle and fills the option, SKU, price, inventory and weight columns.
- Leave every image column and the Collection column empty. Images and collections are added separately.

Product rules:

- **Title:** unique, 2–6 words, natural and descriptive (e.g. "Relaxed Linen Shirt"). Don't put a color in the title, because each product comes in several colors. No duplicate or near-duplicate titles.
- **URL handle:** the title in lowercase English with hyphens. Unique. No underscores.
- **Description:** HTML using only `<p>`, `<ul>`, `<li>` and `<strong>`. One `<p>` of 40–70 words in a warm, specific voice: what it is, how it feels, when to wear it. Then a `<ul>` with exactly four items that start with `<strong>Fabric:</strong>`, `<strong>Fit:</strong>`, `<strong>Care:</strong>` and `<strong>Model:</strong>` (the model's height and the size worn).
- **Vendor:** the brand (see "Brands").
- **Type:** the plain garment type, such as Shirt, Blouse, T-shirt, Trousers, Dress, Cardigan, Blazer or Co-ord set. Not the collection name.
- **Product category:** the Shopify Standard Product Taxonomy path, only when you're certain the path exists exactly (e.g. "Apparel & Accessories > Clothing > Shirts & Tops"). Otherwise leave it empty.
- **Options:** Option1 name "Color" and Option2 name "Size", spelled exactly like that. 2–4 colors per product, taken from the palette. Every size in every color.
- **Tags:** comma-separated, lowercase, from this scheme only:
  - exactly one category tag: the category handle, e.g. `tops-blouses`
  - exactly one edit tag: `edit-` plus the edit handle, e.g. `edit-the-executive-foundation`
  - 2–4 attribute tags: fabric (`linen`, `cotton`, `cashmere`, `wool`, `silk`), fit (`relaxed-fit`, `tailored-fit`) and use (`workwear`, `loungewear`, `occasion`, `everyday`)
  - `bestseller` on about 15% of products
  - `label:<text>` on at most 10% of products. The theme shows this as a badge on the product card, e.g. `label:Limited edition`.
  - No sale or new tags. The theme works those out from prices and publish dates.
- **Price:** in the store currency, ending in 90 (e.g. 3590.00), and sensible for the category and fabric (cashmere costs more than cotton). The same price for every variant of a product.
- **Compare-at price:** only on the on-sale share of products, 20–35% above the price and also ending in 90. Empty for all other products.
- **SKU:** unique and uppercase, in the form `<BRAND CODE>-<TYPE CODE>-<3-digit product number>-<COLOR CODE>-<SIZE>`, e.g. `ET-SHT-014-OAT-M`.
- **Inventory:** tracker "shopify". Quantity 3–30, with about 5% of variants at 0 so sold-out states show. Don't continue selling when out of stock.
- **Shipping:** weight in grams, realistic for the garment (a T-shirt about 180, a blazer about 650). Requires shipping: true. Charge tax: true.
- **SEO title:** at most 60 characters, in the form "<Title> | <Brand>". **SEO description:** one sentence, at most 155 characters.
- **Status:** active, and published on the online store.
- Never use real brand names, trademarks, celebrity names or copied text.

### 2. collections.csv

Columns: Title, Handle, Description, Rule.

- One row per category, with the rule `tag = <category handle>`.
- One row per edit, with the rule `tag = edit-<edit handle>`.
- New Arrivals, with the rule `all products, newest first`.
- Sale, with the rule `compare-at price is set`.
- Bestsellers, with the rule `tag = bestseller`.
- Description: one or two sentences, 20–35 words, in the same voice as the products.

### 3. image-shots.csv

Columns: File name, Product title, Color, Shot, Image prompt.

For each product, list exactly three images, in this order, all in the product's first color:

- `<handle>_1.jpg`: front view. This is the main image on product cards.
- `<handle>_2.jpg`: worn by the model. This is the hover image on product cards.
- `<handle>_3.jpg`: back view or close-up of the fabric and details.

Image prompt: one self-contained paragraph. Describe the exact garment (cut, length, neckline, sleeves, closures, fabric texture, color) in the same words in every shot of that product, then describe the shot. Front and back views show the garment on an invisible (ghost) mannequin; model shots use the model described in "My store". End every prompt with this line:

"Photorealistic e-commerce photo, portrait 3:4, soft natural daylight, plain warm off-white studio background, garment centred with even space around it, no text, no logos, no watermark, no props."

### 4. swatches.txt

Every color used, one per line as `Name: #hex`, spelled exactly as in the Color option. I'll paste this into the theme's Swatch colors setting.

## Before you start

Show me a plan first: the categories and edits with product counts, 5 sample product titles with prices, and the color palette with hex codes. Wait for my OK, then build the files.

When the files are done, check them and report: row counts, that every handle and every SKU is unique, that every product has exactly one category tag and one edit tag, the share of products on sale, and that every color in products.csv appears in swatches.txt.
