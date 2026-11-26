# Modern Fashion – Shopify theme

An Online Store 2.0 theme for fashion and lifestyle brands: apparel, streetwear, luxury, footwear, accessories and jewellery. It is built from the *Modern Fashion – Product Requirements & Development Blueprint v2.0* and covers the P0 launch scope plus most P1 differentiators.

Everything is plain Liquid, CSS and vanilla JavaScript. There are no external libraries.

---

## 1. Install and preview

Requirements: [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) and a development store.

```bash
shopify theme dev --store your-store.myshopify.com     # live preview with hot reload
shopify theme check                                    # lint (Theme Check)
shopify theme push --unpublished --store your-store.myshopify.com
```

After the first push, open **Online Store > Themes > Customize**.

### Store setup checklist

| Task | Where | Why |
| --- | --- | --- |
| Create a `main-menu` with 3 levels (e.g. *Women > Clothing > Dresses*) | Content > Menus | Three-level links open a mega menu, two-level links open a dropdown |
| Add a **Mega menu images** block to the header with *Menu item* = the top-level title (e.g. `Women`) | Theme editor > Header | Adds two promo images to that mega menu |
| Create a `footer` menu | Content > Menus | Footer *Help* column |
| Install **Shopify Search & Discovery** and add filters (Size, Color, Price, Availability) | Apps | Collection and search filters; complementary products for *Complete the look* |
| Link the colour option to the *Color* category metafield, or set swatches on option values | Products | Real swatch colours/images in cards, filters and the product page |
| Create a *Size guide* page and choose it in the product page **Variant picker** or **Size guide** block | Online Store > Pages | Opens the size chart in a modal |
| Optional: add product metafield `custom.badge` (single line text) | Settings > Custom data | Custom card labels. A product tag such as `label:Bestseller` works too, and label rules by tag, collection, vendor or product type can be set in Theme settings > Product labels |
| Optional: a reviews app that writes `reviews.rating` / `reviews.rating_count` | Apps | Star ratings on cards and product pages |

---

## 2. Theme styles (presets)

Five presets ship in `config/settings_data.json` (**Theme settings > Theme styles**):

| Preset | Typography | Look |
| --- | --- | --- |
| Modern Apparel (default) | Instrument Sans | Warm off-white, 3:4 portrait cards, conversion card layout |
| Streetwear | Archivo 800, uppercase | High contrast black/white, orange and cobalt accents, square corners |
| Luxury Minimal | Cormorant + Jost | Ivory, tall 2:3 imagery, editorial centred cards, letter-spaced labels |
| Footwear | DM Sans | White, square "contained" product shots, pill buttons, ratings on cards |
| Accessories | DM Serif Display + Karla | Blush neutrals, rounded media, vendor on cards |

Each preset changes fonts, color schemes, buttons, radii, card layout, image ratio and spacing. All of these can still be edited per store.

---

## 3. Global settings (Theme settings)

- **Colors**: five color schemes (background, gradient, text, buttons, links, accent, card surface) plus badge and sale-price colors. Every section has a color scheme picker, always shown as its first setting.
- **Typography**: heading and body fonts (Shopify font library), size scales, heading letter spacing, line height and case, label case and spacing.
- **Layout**: page width, desktop and mobile side margins, extra space between sections, mobile section spacing (as a share of desktop), grid gaps.
- **Buttons and forms**: corner radius, border, height, input radius, swatch shape, and **Swatch colours**: a `Name: #hex` list used when a colour option has no swatch set in Shopify admin (pre-filled with about 40 fashion colours such as Oat, Taupe, Clay and Espresso).
- **Collection list section**: tiles use the first product's image by default, or the collection image (setting: *Collection image*). The title sits below the image or on it in nine positions (top, middle or bottom; left, center or right).
- **Media**: image radius, product image ratio (3:4, 4:5, 2:3, 1:1, natural) and fit. Cart, upsell, compare and wishlist thumbnails follow the same ratio. Every image setting in the editor shows its recommended ratio and size (for example *2:3 portrait, 1200 x 1800 px*).
- **Product cards**: layout (Minimal, Fashion standard, Conversion, Editorial), alignment, vendor, rating, swatch limit.
- **Product labels**: up to 6 custom labels shown by tag, collection, vendor or product type, each with its own text, colors and priority; priorities for the Sale, New and Sold out labels; a maximum number of labels per product; sale label style and how long products count as new.
- **Cart**: drawer or page, order note, free-shipping threshold, gift-with-purchase threshold, upsell collection.
- **Search**: color scheme, suggestions on/off, vendor, popular searches. Search opens from the header icon: a side drawer on desktop, a slim bar under the header on phones.
- **Animations**: reveal on scroll, image hover zoom (Theme settings → Animations → *Image hover effect*). Every section that zooms images has its own *Zoom images on hover* switch (the header has *Zoom mega menu images on hover*), and the slideshow has *Zoom effect on slide change*. Reduced motion is always respected.
- **Social media**, **Currency format**, **Favicon**.

---

## 4. Feature classification (PRD §5 implementation principle)

| Feature | Type | Notes |
| --- | --- | --- |
| Header, mega menu, dropdowns, mobile drawer, sticky/transparent header, countdown bar, separate logos for the transparent header and for the scrolled sticky header | Native | `sections/header.liquid` |
| Announcement bar: rotating messages (auto-rotate on/off and speed), sticky bar, desktop and mobile text sizes | Native | `sections/announcement-bar.liquid` |
| Predictive search: side drawer on desktop, bar under the header on phones, suggestions and product list | Native | Shopify Predictive Search API, `snippets/search-modal.liquid` |
| Hero and slideshow with *Image focus* (top, center, bottom) so faces stay in view when the screen crops the image | Native | `sections/hero.liquid`, `sections/slideshow.liquid` |
| Slideshow indicators: dashes, dots or numbers, on or below the image, aligned left, center or right; arrows with the indicators or on the sides; optional pause button | Native | `sections/slideshow.liquid` |
| Product page option to fit images to the screen height | Native | `sections/main-product.liquid` |
| Collection tabs: arrows next to the heading, next to the tabs, below them or hidden, set separately for desktop and mobile | Native | `sections/collection-tabs.liquid` |
| Product cards: arrows to browse a product's images on the collection page, homepage and every product grid (on hover on desktop, always on phones), each switchable, with *Images per card* | Native | `snippets/product-card.liquid`, `ProductCard` in `assets/theme.js` |
| Every carousel: *Show part of the next item* (the next slide peeks in on desktop, tablet and phone) and *Show progress bar*; both drop away automatically when every item already fits | Native | `.carousel--peek-*` in `assets/base.css` |
| Product labels with rules (tag, collection, vendor, product type), colors and priority, without an app | Native | `snippets/badges.liquid`, Theme settings > Product labels |
| Featured product section: gallery with video and 3D, variant picker, quantity, buy buttons, app blocks and Custom Liquid | Native | `sections/featured-product.liquid` |
| Before/after image slider: drag, swipe or arrow keys, labels, four image ratios | Native | `sections/before-after.liquid` |
| Editorial grid: free placement on a 12-column desktop and 6-column mobile grid. Each *Grid item* has automatic or custom placement (start row, start column, span columns, span rows), horizontal and vertical shift, text on the image, bring to front and show on desktop/mobile only, set separately for desktop and mobile. Items hold Image (desktop and mobile image, shape, link, caption, custom width with desktop and mobile maximum width), Heading, Text, Button, Spacer and Custom Liquid blocks. Phones can use the grid, a swipeable carousel or one per row | Native | `sections/editorial-grid.liquid`, `blocks/_editorial-item.liquid`, `blocks/_editorial-image.liquid` |
| Category circles: round (or rounded/square) collection images with labels, 3–10 per row, swipe or wrap on phones, arrows on hover, optional ring border, image focus so faces stay in the circle, product counts | Native | `sections/category-circles.liquid` |
| Image size (Original image ratio, X-Small, Small, Medium, Large; the editorial grid sets a shape per image) in collection lists, blog posts, image with text, lookbook, articles, shop the look, promo banner, newsletter, before/after and video; slideshow and hero add X-Small and Original image ratio to their sizes | Native | `.media--size-*` in `assets/base.css`, size rules in `assets/sections.css` |
| Cart drawer, free-shipping bar, gift message, cart upsell | Native | Cart AJAX API + Section Rendering API |
| Product cards (4 layouts), hover image, swatches, badges, quick add, quick view | Native | `snippets/product-card.liquid`, `sections/quick-view.liquid` |
| Variant picker with swatches, sold-out states, combined listings | Native | `option_values` + Section Rendering API |
| Product gallery, zoom, lightbox, video, 3D | Native | |
| Sticky add to cart, size guide, fit info, collapsible tabs | Native | |
| Pickup availability | Native | Needs local pickup enabled for a location |
| Dynamic checkout buttons, Shop Pay Installments | Native (Shopify) | `payment_button`, `payment_terms` |
| Collection filters and sorting | Native + free app | Filters are configured in Search & Discovery |
| Related products / Complete the look | Native + free app | Product Recommendations API; complementary products are set in Search & Discovery |
| Recently viewed products | Native | Browser storage, no account needed |
| Newsletter signup | Native | Customers tagged `newsletter` |
| Countdown timers | Native | Timer runs in the shopper's local time |
| Product ratings and reviews | App-integrated | Reads `reviews.rating`; review widgets via app blocks |
| Wishlist (hearts on cards and product pages, header drawer) | Native | Browser storage, `assets/wishlist.js`; can be switched off in Theme settings to use a wishlist app instead |
| Back-in-stock alerts | App-integrated | App block on the product page |
| Size and fit recommendations | App-integrated | App block on the product page |
| Frequently bought together bundles | App-integrated | Complementary products cover simple pairing natively |
| Live Instagram feed | External service | The Social gallery section uses merchant-uploaded images; a live feed needs an app |

---

## 5. File structure

```
assets/      base.css, components.css, sections.css, product.css, collection.css, pages.css
             theme.js (core), product.js, sections.js, facets.js
blocks/      reusable theme blocks for the Custom section; _editorial-item and _editorial-image for the Editorial grid
config/      settings_schema.json, settings_data.json (5 presets)
layout/      theme.liquid, password.liquid
locales/     en.default.json
sections/    header/footer groups, homepage, product, collection, cart, search, blog, customer sections
snippets/    product-card, price, badges, swatches, variant-picker, buy-buttons, cart-line-item, icon, ...
templates/   JSON templates incl. customers/*, gift_card.liquid, page.campaign.json
```

### JavaScript contracts (for developers)

- `theme.js` defines custom elements `<product-form>`, `<variant-picker>`, `<product-card>`, `<quantity-input>`, `<predictive-search>`, `<site-header>`, `<announcement-bar>`, `<carousel-slider>`, `<countdown-timer>`, `<cart-goals>`, `<localization-form>`, and exposes `window.theme.cart`, `theme.toast`, `theme.openDialog`, `theme.quickView`, `theme.utils`.
- All drawers and modals are native `<dialog>` elements opened with `data-dialog-open="<id>"` and closed with `data-dialog-close`. This gives focus trapping, an inert background and Escape to close.
- Variant changes re-render the product section via `?option_values=…&section_id=…`. Elements marked `data-update="key"` are swapped, and a `variant:change` event fires on `document`.
- Cart changes request the `cart-drawer`, `cart-count` and any `[data-cart-section]` sections in the same call. A `cart:updated` event fires on `document`.

---

## 6. Quality checklist before Theme Store submission

- [ ] `shopify theme check` passes with no errors.
- [ ] Lighthouse on home, product and collection pages, desktop and mobile: performance ≥ 60 and accessibility ≥ 90 (internal targets are higher).
- [ ] Keyboard-only pass: menus, drawers, quick view, variant picker, filters, gallery and lightbox.
- [ ] Screen reader pass (VoiceOver, NVDA).
- [ ] Theme editor: add, remove and reorder every section and block, and check that `shopify:section:load` re-initialises them.
- [ ] Variant edge cases: sold-out combinations, products with 1 option or 3 options, more than 250 variants, combined listings, gift cards, selling plans.
- [ ] Multi-currency and multi-language: free-shipping threshold conversion, localization selectors.
- [ ] Replace `theme_author`, `theme_documentation_url` and `theme_support_url` in `config/settings_schema.json`.
- [ ] Translate `locales/en.default.json` into the languages you sell in, and add schema translation files if you plan to list on the Theme Store.
