(() => {
  const KEY = 'theme:compare';
  const MAX = 4;

  const readStrings = () => {
    const el = document.getElementById('CompareStrings');
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
        return Array.isArray(items) ? items.slice(0, MAX) : [];
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
      document.dispatchEvent(new CustomEvent('compare:change', { detail: { items } }));
    },
    has(handle) {
      return this.get().some((item) => item.handle === handle);
    },
  };

  const announce = (message) => {
    const status = document.querySelector('[data-compare-status]');
    if (status) status.textContent = message;
  };

  const escapeHTML = (value) =>
    String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  class CompareToggle extends HTMLElement {
    connectedCallback() {
      this.input = this.querySelector('input');
      if (!this.input) return;
      this.input.checked = store.has(this.dataset.handle);
      this.input.addEventListener('change', this.onChange);
      document.addEventListener('compare:change', this.sync);
    }

    disconnectedCallback() {
      document.removeEventListener('compare:change', this.sync);
    }

    sync = () => {
      if (this.input) this.input.checked = store.has(this.dataset.handle);
    };

    onChange = () => {
      const items = store.get().filter((item) => item.handle !== this.dataset.handle);
      if (this.input.checked) {
        if (items.length >= MAX) {
          this.input.checked = false;
          announce(strings.max);
          if (window.theme && window.theme.toast) window.theme.toast(strings.max);
          return;
        }
        items.push({ handle: this.dataset.handle, title: this.dataset.title, image: this.dataset.image });
        announce(`${this.dataset.title} ${strings.added || ''}`);
      } else {
        announce(`${this.dataset.title} ${strings.removed || ''}`);
      }
      store.set(items);
    };
  }
  if (!customElements.get('compare-toggle')) customElements.define('compare-toggle', CompareToggle);

  class CompareTray extends HTMLElement {
    static COLLAPSE_KEY = 'theme:compare-collapsed';

    connectedCallback() {
      this.list = this.querySelector('[data-compare-list]');
      this.count = this.querySelector('[data-compare-count]');
      this.hint = this.querySelector('[data-compare-hint]');
      this.collapseButton = this.querySelector('[data-compare-collapse]');
      this.modal = document.getElementById(this.dataset.modal);
      this.addEventListener('click', this.onClick);
      document.addEventListener('compare:change', this.render);
      if ('ResizeObserver' in window) {
        this.resizeObserver = new ResizeObserver(this.updateOffset);
        this.resizeObserver.observe(this);
      }
      let collapsed = false;
      try {
        collapsed = sessionStorage.getItem(CompareTray.COLLAPSE_KEY) === 'true';
      } catch (error) {
        collapsed = false;
      }
      this.setCollapsed(collapsed);
      this.render();
    }

    disconnectedCallback() {
      document.removeEventListener('compare:change', this.render);
      if (this.resizeObserver) this.resizeObserver.disconnect();
      document.documentElement.style.removeProperty('--compare-tray-height');
    }

    updateOffset = () => {
      const height = this.hidden ? 0 : this.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--compare-tray-height', `${Math.ceil(height)}px`);
    };

    setCollapsed(collapsed) {
      this.classList.toggle('is-collapsed', collapsed);
      if (this.collapseButton) {
        this.collapseButton.setAttribute('aria-expanded', String(!collapsed));
        this.collapseButton.setAttribute('aria-label', (collapsed ? strings.expand : strings.collapse) || '');
      }
      try {
        sessionStorage.setItem(CompareTray.COLLAPSE_KEY, String(collapsed));
      } catch (error) {
        // storage unavailable: state lasts for this page only
      }
      this.updateOffset();
    }

    render = () => {
      const items = store.get();
      this.hidden = items.length === 0;
      document.body.classList.toggle('has-compare-tray', items.length > 0);
      if (this.count) this.count.textContent = items.length ? `(${items.length}/${MAX})` : '';
      const filled = items.map(
        (item) => `<li class="compare-tray__slot">
            <span class="compare-tray__thumb">${item.image ? `<img src="${escapeHTML(item.image)}" alt="" width="48" height="60" loading="lazy">` : ''}</span>
            <span class="compare-tray__name">${escapeHTML(item.title)}</span>
            <button type="button" class="compare-tray__remove" data-compare-remove="${escapeHTML(item.handle)}" aria-label="${escapeHTML(`${strings.remove || 'Remove'}: ${item.title}`)}">
              <svg aria-hidden="true" focusable="false" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 2.5l7 7m0-7l-7 7"/></svg>
            </button>
          </li>`
      );
      const empty = Array.from(
        { length: Math.max(0, MAX - items.length) },
        () => `<li class="compare-tray__slot compare-tray__slot--empty" aria-hidden="true"><span class="compare-tray__thumb"></span><span class="compare-tray__name">${escapeHTML(strings.emptySlot || '')}</span></li>`
      );
      this.list.innerHTML = filled.concat(empty).join('');
      const open = this.querySelector('[data-compare-open]');
      if (open) open.disabled = items.length < 2;
      if (this.hint) this.hint.hidden = items.length >= 2;
      this.updateOffset();
    };

    onClick = (event) => {
      const remove = event.target.closest('[data-compare-remove]');
      if (remove) {
        store.set(store.get().filter((item) => item.handle !== remove.dataset.compareRemove));
        return;
      }
      if (event.target.closest('[data-compare-clear]')) {
        store.set([]);
        return;
      }
      if (event.target.closest('[data-compare-collapse]')) {
        this.setCollapsed(!this.classList.contains('is-collapsed'));
        return;
      }
      const open = event.target.closest('[data-compare-open]');
      if (open) this.openModal(open);
    };

    money(cents) {
      const currency = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'USD';
      try {
        return new Intl.NumberFormat(document.documentElement.lang || undefined, { style: 'currency', currency }).format(cents / 100);
      } catch (error) {
        return (cents / 100).toFixed(2);
      }
    }

    get themeStrings() {
      return (window.theme && window.theme.strings) || {};
    }

    bindModal() {
      if (!this.modal || this.modalBound) return;
      this.modalBound = true;
      this.cache = new Map();
      this.modal.addEventListener('click', this.onModalClick);
      document.addEventListener('compare:change', () => {
        if (this.modal.open) this.renderTable();
      });
    }

    async fetchProduct(handle) {
      if (this.cache.has(handle)) return this.cache.get(handle);
      const root = (window.theme && window.theme.routes && window.theme.routes.root) || '/';
      const base = root.endsWith('/') ? root : `${root}/`;
      try {
        const response = await fetch(`${base}products/${encodeURIComponent(handle)}.js`);
        const product = response.ok ? await response.json() : null;
        if (product) this.cache.set(handle, product);
        return product;
      } catch (error) {
        return null;
      }
    }

    async openModal(opener) {
      if (!this.modal) return;
      this.bindModal();
      if (window.theme && window.theme.openDialog) window.theme.openDialog(this.modal, opener);
      else this.modal.showModal();
      await this.renderTable();
    }

    async renderTable() {
      const table = this.modal.querySelector('[data-compare-table]');
      if (!table) return;
      const items = store.get();
      if (!items.length) {
        this.modal.close();
        return;
      }
      if (!items.every((item) => this.cache.has(item.handle))) {
        table.setAttribute('aria-busy', 'true');
        table.innerHTML = `<p class="compare-modal__status"><span class="loading-spinner" aria-hidden="true"></span>${escapeHTML(this.themeStrings.loading || '')}</p>`;
      }
      const products = (await Promise.all(items.map((item) => this.fetchProduct(item.handle)))).filter(Boolean);
      table.innerHTML = products.length
        ? this.buildTable(products)
        : `<p class="compare-modal__status">${escapeHTML(strings.error || '')}</p>`;
      table.removeAttribute('aria-busy');
    }

    onModalClick = async (event) => {
      const remove = event.target.closest('[data-compare-modal-remove]');
      if (remove) {
        const handle = remove.dataset.compareModalRemove;
        const item = store.get().find((entry) => entry.handle === handle);
        store.set(store.get().filter((entry) => entry.handle !== handle));
        if (item) announce(`${item.title} ${strings.removed || ''}`);
        const heading = this.modal.querySelector('h2');
        if (heading) {
          heading.setAttribute('tabindex', '-1');
          heading.focus();
        }
        return;
      }
      const add = event.target.closest('[data-compare-add]');
      if (!add || !window.theme || !window.theme.cart) return;
      add.classList.add('is-loading');
      add.disabled = true;
      try {
        const formData = new FormData();
        formData.append('id', add.dataset.compareAdd);
        formData.append('quantity', '1');
        await window.theme.cart.add(formData);
        if (window.theme.settings && window.theme.settings.cartType === 'page') {
          window.location.href = window.theme.routes.cart;
          return;
        }
        this.modal.close();
        if (document.getElementById('CartDrawer')) window.theme.cart.open(add);
        else if (window.theme.toast) window.theme.toast(this.themeStrings.addedToCart);
      } catch (error) {
        if (window.theme.toast) window.theme.toast(error.message);
      } finally {
        add.classList.remove('is-loading');
        add.disabled = false;
      }
    };

    buildTable(products) {
      const optionNames = [];
      products.forEach((p) =>
        (p.options || []).forEach((o) => {
          const name = typeof o === 'string' ? o : o.name;
          if (name && name !== 'Title' && !optionNames.includes(name)) optionNames.push(name);
        })
      );
      const t = this.themeStrings;
      const price = (p) => {
        const current = p.price_min !== p.price_max ? `${this.money(p.price_min)} – ${this.money(p.price_max)}` : this.money(p.price);
        const compare = p.compare_at_price && p.compare_at_price > p.price ? ` <s class="compare-modal__compare-at">${escapeHTML(this.money(p.compare_at_price))}</s>` : '';
        return `<span class="compare-modal__price${compare ? ' compare-modal__price--sale' : ''}">${escapeHTML(current)}</span>${compare}`;
      };
      const action = (p) => {
        const label = `<span class="visually-hidden">: ${escapeHTML(p.title)}</span>`;
        if (!p.available) return `<button type="button" class="button button--small button--secondary button--full" disabled>${escapeHTML(t.soldOut || strings.soldOut)}</button>`;
        if (p.variants && p.variants.length === 1) {
          return `<button type="button" class="button button--small button--full" data-compare-add="${p.variants[0].id}">${escapeHTML(t.addToCart || '')}${label}<span class="loading-spinner" aria-hidden="true"></span></button>`;
        }
        return `<button type="button" class="button button--small button--secondary button--full" data-quick-view="${escapeHTML(p.url)}" aria-haspopup="dialog">${escapeHTML(strings.chooseOptions || '')}${label}</button>`;
      };
      const head = products
        .map((p) => {
          const src = p.featured_image ? `${p.featured_image}${p.featured_image.includes('?') ? '&' : '?'}width=400` : '';
          return `<th scope="col" role="columnheader" class="compare-modal__col">
            <div class="compare-modal__product">
              <button type="button" class="compare-modal__remove" data-compare-modal-remove="${escapeHTML(p.handle)}" aria-label="${escapeHTML(`${strings.remove || 'Remove'}: ${p.title}`)}">
                <svg aria-hidden="true" focusable="false" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 2.5l7 7m0-7l-7 7"/></svg>
              </button>
              <a href="${escapeHTML(p.url)}" class="compare-modal__media" tabindex="-1" aria-hidden="true">
                ${src ? `<img src="${escapeHTML(src)}" alt="" loading="lazy" width="200" height="250">` : ''}
              </a>
              <a href="${escapeHTML(p.url)}" class="compare-modal__title">${escapeHTML(p.title)}</a>
              <p class="compare-modal__prices">${price(p)}</p>
              ${action(p)}
            </div>
          </th>`;
        })
        .join('');
      const row = (label, cells) =>
        `<tr role="row"><th scope="row" role="rowheader"><span>${escapeHTML(label)}</span></th>${cells.map((c) => `<td role="cell">${c}</td>`).join('')}</tr>`;
      const rows = [
        row(strings.vendor || 'Brand', products.map((p) => escapeHTML(p.vendor || '–'))),
        row(strings.type || 'Type', products.map((p) => escapeHTML(p.type || '–'))),
        ...optionNames.map((name) =>
          row(
            name,
            products.map((p) => {
              const option = (p.options || []).find((o) => (typeof o === 'string' ? o : o.name) === name);
              return option && option.values ? escapeHTML(option.values.join(', ')) : '–';
            })
          )
        ),
        row(
          strings.availability || 'Availability',
          products.map(
            (p) =>
              `<span class="compare-modal__stock compare-modal__stock--${p.available ? 'in' : 'out'}">${escapeHTML(p.available ? strings.inStock : strings.soldOut)}</span>`
          )
        ),
        row(
          strings.description || 'Details',
          products.map((p) => {
            const text = String(p.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            return `<span class="compare-modal__description">${escapeHTML(text.length > 220 ? `${text.slice(0, 220)}…` : text || '–')}</span>`;
          })
        ),
      ];
      return `<div class="compare-modal__scroll">
        <table class="compare-modal__grid" role="table" style="--compare-cols: ${products.length};">
          <colgroup><col class="compare-modal__label-col">${products.map(() => '<col>').join('')}</colgroup>
          <thead role="rowgroup"><tr role="row"><td class="compare-modal__corner" role="cell"></td>${head}</tr></thead>
          <tbody role="rowgroup">${rows.join('')}</tbody>
        </table>
      </div>`;
    }
  }
  if (!customElements.get('compare-tray')) customElements.define('compare-tray', CompareTray);
})();
