(() => {
  const KEY = 'theme:wishlist';
  const MAX = 50;

  const readStrings = () => {
    const el = document.getElementById('WishlistStrings');
    try {
      return el ? JSON.parse(el.textContent) : {};
    } catch (error) {
      return {};
    }
  };
  const strings = readStrings();

  const store = {
    get() {
      try {
        const items = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(items) ? items.filter((item) => item && item.handle).slice(0, MAX) : [];
      } catch (error) {
        return [];
      }
    },
    set(items) {
      try {
        localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
      } catch (error) {
        return;
      }
      document.dispatchEvent(new CustomEvent('wishlist:change', { detail: { items } }));
    },
    has(handle) {
      return this.get().some((item) => item.handle === handle);
    },
    remove(handle) {
      this.set(this.get().filter((item) => item.handle !== handle));
    },
  };

  const announce = (message) => {
    const status = document.querySelector('[data-wishlist-status]');
    if (status) status.textContent = message;
  };

  const escapeHTML = (value) =>
    String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const money = (cents) => {
    const currency = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'USD';
    try {
      return new Intl.NumberFormat(document.documentElement.lang || undefined, { style: 'currency', currency }).format(cents / 100);
    } catch (error) {
      return (cents / 100).toFixed(2);
    }
  };

  const updateCounts = () => {
    const count = store.get().length;
    document.querySelectorAll('[data-wishlist-count]').forEach((el) => {
      el.textContent = count > 0 ? String(count) : '';
    });
    document.querySelectorAll('[data-wishlist-total]').forEach((el) => {
      el.textContent = String(count);
    });
    document.querySelectorAll('[data-wishlist-count-label]').forEach((el) => {
      el.textContent = String((count === 1 ? strings.countOne : strings.countOther) || '').replace('[count]', count);
    });
  };

  class WishlistToggle extends HTMLElement {
    connectedCallback() {
      this.button = this.querySelector('button');
      if (!this.button) return;
      this.sync();
      this.button.addEventListener('click', this.onClick);
      document.addEventListener('wishlist:change', this.sync);
    }

    disconnectedCallback() {
      document.removeEventListener('wishlist:change', this.sync);
    }

    sync = () => {
      const saved = store.has(this.dataset.handle);
      this.classList.toggle('is-saved', saved);
      if (this.dataset.style === 'text') {
        this.button.removeAttribute('aria-pressed');
      } else {
        this.button.setAttribute('aria-pressed', String(saved));
      }
    };

    onClick = (event) => {
      event.preventDefault();
      const { handle, title } = this.dataset;
      if (store.has(handle)) {
        store.remove(handle);
        announce(`${title} ${strings.removed || ''}`);
        return;
      }
      const items = store.get();
      if (items.length >= MAX) items.shift();
      items.push({ handle, title, image: this.dataset.image || '' });
      store.set(items);
      announce(`${title} ${strings.added || ''}`);
      if (window.theme && window.theme.toast && strings.addedToast) window.theme.toast(strings.addedToast);
    };
  }
  if (!customElements.get('wishlist-toggle')) customElements.define('wishlist-toggle', WishlistToggle);

  class WishlistDrawer extends HTMLElement {
    connectedCallback() {
      this.list = this.querySelector('[data-wishlist-list]');
      this.empty = this.querySelector('[data-wishlist-empty]');
      this.cache = new Map();
      this.dialog = this.closest('dialog');
      if (this.dialog) this.dialog.addEventListener('dialog:open', this.render);
      this.addEventListener('click', this.onClick);
      document.addEventListener('wishlist:change', this.onChange);
      window.addEventListener('storage', this.onStorage);
      updateCounts();
    }

    disconnectedCallback() {
      document.removeEventListener('wishlist:change', this.onChange);
      window.removeEventListener('storage', this.onStorage);
    }

    onChange = () => {
      updateCounts();
      if (this.dialog && this.dialog.open) this.render();
    };

    onStorage = (event) => {
      if (event.key !== KEY) return;
      document.dispatchEvent(new CustomEvent('wishlist:change', { detail: { items: store.get() } }));
    };

    async fetchProduct(handle) {
      if (this.cache.has(handle)) return this.cache.get(handle);
      const root = (window.theme && window.theme.routes && window.theme.routes.root) || '/';
      const base = root.endsWith('/') ? root : `${root}/`;
      try {
        const response = await fetch(`${base}products/${encodeURIComponent(handle)}.js`);
        const product = response.ok ? await response.json() : null;
        this.cache.set(handle, product);
        return product;
      } catch (error) {
        return undefined;
      }
    }

    render = async () => {
      const items = store.get();
      this.empty.hidden = items.length > 0;
      this.list.hidden = items.length === 0;
      if (!items.length) {
        this.list.innerHTML = '';
        return;
      }
      this.list.setAttribute('aria-busy', 'true');
      const products = await Promise.all(items.map((item) => this.fetchProduct(item.handle)));
      const missing = items.filter((item, i) => products[i] === null).map((item) => item.handle);
      if (missing.length) {
        store.set(store.get().filter((item) => !missing.includes(item.handle)));
        return;
      }
      this.list.innerHTML = items
        .map((item, i) => {
          const product = products[i];
          if (!product) return '';
          const image = product.featured_image || item.image;
          const src = image ? `${image}${image.includes('?') ? '&' : '?'}width=240` : '';
          const single = product.variants && product.variants.length === 1;
          const variant = single ? product.variants[0] : null;
          let action;
          if (!product.available) {
            action = `<button type="button" class="button button--small button--secondary" disabled>${escapeHTML(strings.soldOut)}</button>`;
          } else if (variant) {
            action = `<button type="button" class="button button--small" data-wishlist-add="${variant.id}">${escapeHTML(strings.addToCart)}<span class="visually-hidden">: ${escapeHTML(product.title)}</span></button>`;
          } else {
            action = `<button type="button" class="button button--small button--secondary" data-quick-view="${escapeHTML(product.url)}" aria-haspopup="dialog">${escapeHTML(strings.chooseOptions)}<span class="visually-hidden">: ${escapeHTML(product.title)}</span></button>`;
          }
          const price =
            product.price_min !== product.price_max
              ? `${escapeHTML(strings.from || '')} ${escapeHTML(money(product.price_min))}`
              : escapeHTML(money(product.price));
          const compare =
            product.compare_at_price && product.compare_at_price > product.price
              ? ` <s class="price__compare">${escapeHTML(money(product.compare_at_price))}</s>`
              : '';
          return `<li class="wishlist-item">
            <a href="${escapeHTML(product.url)}" class="wishlist-item__media" tabindex="-1" aria-hidden="true">
              ${src ? `<img src="${escapeHTML(src)}" alt="" width="96" height="120" loading="lazy">` : ''}
            </a>
            <div class="wishlist-item__info">
              <a href="${escapeHTML(product.url)}" class="wishlist-item__title">${escapeHTML(product.title)}</a>
              <p class="wishlist-item__price">${price}${compare}</p>
              <div class="wishlist-item__actions">
                ${action}
                <button type="button" class="link wishlist-item__remove" data-wishlist-remove="${escapeHTML(item.handle)}">
                  ${escapeHTML(strings.remove)}<span class="visually-hidden">: ${escapeHTML(product.title)}</span>
                </button>
              </div>
            </div>
          </li>`;
        })
        .join('');
      this.list.removeAttribute('aria-busy');
    };

    onClick = async (event) => {
      const remove = event.target.closest('[data-wishlist-remove]');
      if (remove) {
        const item = store.get().find((entry) => entry.handle === remove.dataset.wishlistRemove);
        store.remove(remove.dataset.wishlistRemove);
        if (item) announce(`${item.title} ${strings.removed || ''}`);
        const heading = this.querySelector('[data-wishlist-heading]');
        if (heading) heading.focus();
        return;
      }
      const add = event.target.closest('[data-wishlist-add]');
      if (!add || !window.theme || !window.theme.cart) return;
      add.classList.add('is-loading');
      add.disabled = true;
      try {
        const formData = new FormData();
        formData.append('id', add.dataset.wishlistAdd);
        formData.append('quantity', '1');
        await window.theme.cart.add(formData);
        if (window.theme.settings && window.theme.settings.cartType === 'page') {
          window.location.href = window.theme.routes.cart;
          return;
        }
        if (document.getElementById('CartDrawer')) {
          window.theme.cart.open(add);
        } else if (window.theme.toast) {
          window.theme.toast(strings.addedToCart);
        }
      } catch (error) {
        if (window.theme.toast) window.theme.toast(error.message);
      } finally {
        add.classList.remove('is-loading');
        add.disabled = false;
      }
    };
  }
  if (!customElements.get('wishlist-drawer')) customElements.define('wishlist-drawer', WishlistDrawer);

  updateCounts();
})();
