(() => {
  const theme = window.theme || (window.theme = {});
  const routes = theme.routes || {};
  const strings = theme.strings || {};

  const debounce = (fn, wait = 300) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait);
    };
  };

  const parseHTML = (html) => new DOMParser().parseFromString(html, 'text/html');

  const fetchHTML = async (url, options = {}) => {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return parseHTML(await response.text());
  };

  const sectionUrl = (url, sectionId, params = {}) => {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('section_id', sectionId);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.toString();
  };

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isRTL = () => document.documentElement.dir === 'rtl';
  // scrollLeft that brings item's inline-start edge to the track's inline-start edge
  const scrollToItemLeft = (track, item) => {
    const a = item.getBoundingClientRect();
    const b = track.getBoundingClientRect();
    return track.scrollLeft + (isRTL() ? a.right - b.right : a.left - b.left);
  };

  let toastTimer;
  const toast = (message) => {
    const el = document.querySelector('[data-toast]');
    if (!el || !message) return;
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
  };

  const openDialog = (dialog, opener) => {
    if (!dialog) return;
    document.querySelectorAll('dialog[open]').forEach((d) => {
      if (d !== dialog && !d.contains(dialog)) d.close();
    });
    if (!dialog.open) dialog.showModal();
    if (opener) dialog._opener = opener;
    dialog.dispatchEvent(new CustomEvent('dialog:open', { bubbles: true }));
  };

  const closeDialog = (dialog) => {
    if (dialog && dialog.open) dialog.close();
  };

  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-dialog-open]');
    if (opener) {
      event.preventDefault();
      openDialog(document.getElementById(opener.dataset.dialogOpen), opener);
      return;
    }
    const closer = event.target.closest('[data-dialog-close]');
    if (closer) {
      event.preventDefault();
      closeDialog(closer.closest('dialog'));
      return;
    }
    if (event.target instanceof HTMLDialogElement && event.target.open) {
      const rect = event.target.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) closeDialog(event.target);
    }
  });

  document.addEventListener(
    'close',
    (event) => {
      const dialog = event.target;
      if (!(dialog instanceof HTMLDialogElement)) return;
      const opener = dialog._opener;
      dialog._opener = null;
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    },
    true
  );

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-modal-template]');
    if (!trigger) return;
    event.preventDefault();
    const template = document.getElementById(trigger.dataset.modalTemplate);
    const modal = document.getElementById('PageModal');
    if (!template || !modal) return;
    const content = modal.querySelector('[data-page-modal-content]');
    content.replaceChildren(template.content.cloneNode(true));
    openDialog(modal, trigger);
  });

  const quickView = async (url, opener) => {
    const modal = document.getElementById('QuickView');
    if (!modal) {
      window.location.href = url;
      return;
    }
    if (opener) opener.setAttribute('aria-busy', 'true');
    try {
      const doc = await fetchHTML(sectionUrl(url, 'quick-view'));
      const root = doc.querySelector('[data-product-root]');
      const content = modal.querySelector('[data-quick-view-content]');
      content.replaceChildren(root);
      openDialog(modal, opener);
      const slider = content.querySelector('[data-quick-view-slider]');
      const initial = slider && slider.dataset.initialMedia;
      if (initial) {
        const slide = slider.querySelector(`[data-media-id="${initial}"]`);
        if (slide) slider.scrollTo({ left: isRTL() ? scrollToItemLeft(slider, slide) : slide.offsetLeft - slider.offsetLeft, behavior: 'instant' });
      }
      if (window.Shopify && window.Shopify.PaymentButton) window.Shopify.PaymentButton.init();
      const models = content.querySelector('[data-product-models]');
      if (models && window.Shopify && typeof window.Shopify.loadFeatures === 'function') {
        window.Shopify.loadFeatures([
          {
            name: 'model-viewer-ui',
            version: '1.0',
            onLoad: (errors) => {
              if (errors || !window.Shopify.ModelViewerUI) return;
              content.querySelectorAll('model-viewer').forEach((viewer) => {
                if (!viewer.modelViewerUI) viewer.modelViewerUI = new window.Shopify.ModelViewerUI(viewer);
              });
            },
          },
          {
            name: 'shopify-xr',
            version: '1.0',
            onLoad: (errors) => {
              if (errors || !window.ShopifyXR) return;
              window.ShopifyXR.addModels(JSON.parse(models.textContent));
              window.ShopifyXR.setupXRElements();
            },
          },
        ]);
      }
      if (!modal.dataset.mediaReset) {
        modal.dataset.mediaReset = 'true';
        modal.addEventListener('close', () => {
          const box = modal.querySelector('[data-quick-view-content]');
          if (box) box.replaceChildren();
          const pendingEdit = modal.dataset.editKey;
          const editOpener = modal._editOpener;
          delete modal.dataset.editKey;
          delete modal.dataset.editVariant;
          delete modal.dataset.editQuantity;
          modal._editOpener = null;
          const drawer = document.getElementById('CartDrawer');
          if (pendingEdit && drawer && editOpener && drawer.contains(editOpener)) {
            openDialog(drawer);
            requestAnimationFrame(() => editOpener.focus());
          }
        });
      }
      const title = content.querySelector('h2');
      if (title) {
        title.setAttribute('tabindex', '-1');
        title.focus({ preventScroll: true });
      }
    } catch (error) {
      window.location.href = url;
    } finally {
      if (opener) opener.removeAttribute('aria-busy');
    }
  };

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-quick-view]');
    if (!trigger) return;
    event.preventDefault();
    quickView(trigger.dataset.quickView, trigger);
  });

  // Change the size or color of a cart line: opens quick view, then swaps the line on submit
  document.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-cart-edit]');
    if (!trigger) return;
    event.preventDefault();
    const modal = document.getElementById('QuickView');
    if (!modal) {
      window.location.href = trigger.dataset.cartEdit;
      return;
    }
    await quickView(trigger.dataset.cartEdit, trigger);
    if (!modal.open) return;
    modal.dataset.editKey = trigger.dataset.key;
    modal.dataset.editVariant = trigger.dataset.variant;
    modal.dataset.editQuantity = trigger.dataset.quantity;
    modal._editOpener = trigger;
    const form = modal.querySelector('[data-quick-view-content] product-form');
    if (form && strings.cartEditNote) {
      const note = document.createElement('p');
      note.className = 'quick-view__edit-note';
      note.textContent = strings.cartEditNote;
      form.before(note);
    }
  });

  const cart = {
    sectionIds() {
      const ids = ['cart-drawer', 'cart-count'];
      document.querySelectorAll('[data-cart-section]').forEach((el) => {
        if (el.dataset.sectionId && !ids.includes(el.dataset.sectionId)) ids.push(el.dataset.sectionId);
      });
      return ids;
    },

    async request(url, body) {
      const isForm = body instanceof FormData;
      const response = await fetch(url, {
        method: 'POST',
        headers: isForm
          ? { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
          : { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: isForm ? body : JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || (typeof data.status === 'number' && data.status >= 400)) {
        const error = new Error(data.description || data.message || strings.cartError);
        error.data = data;
        throw error;
      }
      return data;
    },

    async add(formData) {
      const sections = this.sectionIds();
      formData.append('sections', sections.join(','));
      formData.append('sections_url', window.location.pathname);
      const data = await this.request(`${routes.cartAdd}.js`, formData);
      this.render(data.sections);
      document.dispatchEvent(new CustomEvent('cart:updated', { detail: { source: 'add', item: data } }));
      return data;
    },

    async change(key, quantity) {
      const data = await this.request(`${routes.cartChange}.js`, {
        id: key,
        quantity,
        sections: this.sectionIds(),
        sections_url: window.location.pathname,
      });
      this.render(data.sections);
      document.dispatchEvent(new CustomEvent('cart:updated', { detail: { source: 'change', cart: data } }));
      return data;
    },

    async note(note) {
      return fetch(`${routes.cartUpdate}.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ note }),
      });
    },

    render(sections) {
      if (!sections) return;
      Object.entries(sections).forEach(([id, html]) => {
        if (!html) return;
        const doc = parseHTML(html);
        if (id === 'cart-drawer') {
          const next = doc.querySelector('[data-cart-drawer-inner]');
          const current = document.querySelector('[data-cart-drawer-inner]');
          if (next && current) current.replaceWith(next);
        } else if (id === 'cart-count') {
          const count = doc.querySelector('[data-cart-count]');
          const label = doc.querySelector('[data-cart-count-label]');
          document.querySelectorAll('[data-cart-count]').forEach((el) => {
            if (count) el.innerHTML = count.innerHTML;
          });
          document.querySelectorAll('[data-cart-count-label]').forEach((el) => {
            if (label) el.textContent = label.textContent;
          });
        } else {
          const next = doc.querySelector(`[data-cart-section][data-section-id="${id}"]`);
          const current = document.querySelector(`[data-cart-section][data-section-id="${id}"]`);
          if (next && current) current.replaceWith(next);
        }
      });
    },

    open(opener) {
      const drawer = document.getElementById('CartDrawer');
      if (drawer) openDialog(drawer, opener);
    },
  };

  const focusAfterRender = (selector) => {
    requestAnimationFrame(() => {
      const el = document.querySelector(selector);
      if (el) el.focus({ preventScroll: true });
    });
  };

  const changeLine = debounce(async (input) => {
    const key = input.dataset.key;
    const item = input.closest('[data-cart-item]');
    if (item) item.setAttribute('aria-busy', 'true');
    try {
      await cart.change(key, parseInt(input.value, 10) || 0);
      focusAfterRender(`[data-cart-quantity][data-key="${CSS.escape(key)}"]`);
    } catch (error) {
      const message = item && item.querySelector('[data-line-error]');
      if (message) {
        message.textContent = error.message;
        message.hidden = false;
      } else {
        toast(error.message);
      }
      if (item) item.removeAttribute('aria-busy');
    }
  }, 350);

  document.addEventListener('change', (event) => {
    const input = event.target.closest('[data-cart-quantity]');
    if (input) changeLine(input);
    const note = event.target.closest('[data-cart-note]');
    if (note) cart.note(note.value);
  });

  document.addEventListener('click', async (event) => {
    const remove = event.target.closest('[data-cart-remove]');
    if (!remove) return;
    event.preventDefault();
    const item = remove.closest('[data-cart-item]');
    if (item) item.setAttribute('aria-busy', 'true');
    try {
      await cart.change(remove.dataset.key, 0);
      focusAfterRender('#CartDrawer[open] .drawer__title, [data-cart-section] h1');
    } catch (error) {
      toast(error.message);
      if (item) item.removeAttribute('aria-busy');
    }
  });

  class QuantityInput extends HTMLElement {
    connectedCallback() {
      this.input = this.querySelector('input');
      this.addEventListener('click', this.onClick);
      this.input.addEventListener('change', () => this.updateButtons());
      this.updateButtons();
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.onClick);
    }

    onClick = (event) => {
      const button = event.target.closest('button[name]');
      if (!button || !this.contains(button)) return;
      event.preventDefault();
      const step = parseInt(this.input.step, 10) || 1;
      const min = parseInt(this.input.min, 10) || 0;
      const max = this.input.max ? parseInt(this.input.max, 10) : Infinity;
      const value = parseInt(this.input.value, 10) || min;
      const next = button.name === 'plus' ? Math.min(max, value + step) : Math.max(min, value - step);
      if (next === value) return;
      this.input.value = next;
      this.input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    updateButtons() {
      const min = parseInt(this.input.min, 10) || 0;
      const max = this.input.max ? parseInt(this.input.max, 10) : Infinity;
      const value = parseInt(this.input.value, 10) || 0;
      const minus = this.querySelector('button[name="minus"]');
      const plus = this.querySelector('button[name="plus"]');
      if (minus && !this.input.hasAttribute('data-cart-quantity')) minus.disabled = value <= min;
      if (plus) plus.disabled = value >= max;
    }
  }
  customElements.define('quantity-input', QuantityInput);

  class ProductForm extends HTMLElement {
    connectedCallback() {
      this.form = this.querySelector('form');
      if (!this.form) return;
      this.form.addEventListener('submit', this.onSubmit);
    }

    disconnectedCallback() {
      if (this.form) this.form.removeEventListener('submit', this.onSubmit);
    }

    onSubmit = async (event) => {
      event.preventDefault();
      const button = this.form.querySelector('[type="submit"][name="add"]');
      if (!button || button.disabled || button.classList.contains('is-loading')) return;
      const error = this.querySelector('[data-form-error]');
      if (error) error.hidden = true;
      button.classList.add('is-loading');
      button.setAttribute('aria-disabled', 'true');
      try {
        this.form.querySelectorAll('[data-recipient-offset]').forEach((input) => {
          input.value = new Date().getTimezoneOffset().toString();
        });
        const formData = new FormData(this.form);
        const recipientToggle = this.form.querySelector('.recipient__toggle');
        if (recipientToggle && !recipientToggle.checked) {
          ['Recipient email', 'Recipient name', 'Message', 'Send on', '__shopify_offset'].forEach((key) =>
            formData.delete(`properties[${key}]`)
          );
        }
        const editModal = this.closest('#QuickView');
        const editKey = editModal && editModal.dataset.editKey;
        if (editKey) {
          const quantity = parseInt(editModal.dataset.editQuantity, 10) || 1;
          if (String(formData.get('id')) === editModal.dataset.editVariant) {
            await cart.change(editKey, quantity);
          } else {
            formData.set('quantity', String(quantity));
            await cart.add(formData);
            await cart.change(editKey, 0);
          }
          delete editModal.dataset.editKey;
        } else {
          await cart.add(formData);
        }
        if (theme.settings && theme.settings.cartType === 'page') {
          window.location.href = routes.cart;
          return;
        }
        const quickViewModal = this.closest('#QuickView');
        if (quickViewModal) quickViewModal.close();
        if (document.getElementById('CartDrawer')) {
          cart.open(button);
        } else {
          toast(strings.addedToCart);
        }
      } catch (err) {
        if (error) {
          error.textContent = err.message;
          error.hidden = false;
        } else {
          toast(err.message);
        }
      } finally {
        button.classList.remove('is-loading');
        button.removeAttribute('aria-disabled');
      }
    };
  }
  customElements.define('product-form', ProductForm);

  class VariantPicker extends HTMLElement {
    connectedCallback() {
      this.addEventListener('change', this.onChange);
    }

    disconnectedCallback() {
      this.removeEventListener('change', this.onChange);
    }

    get root() {
      return this.closest('[data-product-root]') || document;
    }

    selectedOptionIds() {
      return [...this.querySelectorAll('input[data-option-value-id]:checked, select')]
        .map((el) => (el.tagName === 'SELECT' ? el.selectedOptions[0] : el))
        .map((el) => el && el.dataset.optionValueId)
        .filter(Boolean);
    }

    onChange = async (event) => {
      const target = event.target;
      const chosen = target.tagName === 'SELECT' ? target.selectedOptions[0] : target;
      const productUrl = (chosen && chosen.dataset.productUrl) || this.dataset.productUrl;
      const sectionId = this.dataset.sectionId;
      const legend = target.closest('fieldset') && target.closest('fieldset').querySelector('[data-selected-value]');
      if (legend && target.type === 'radio') legend.textContent = target.value;

      if (productUrl !== this.dataset.productUrl && this.dataset.updateUrl === 'true') {
        window.location.href = `${productUrl}?option_values=${this.selectedOptionIds().join(',')}`;
        return;
      }

      const focusedId = target.id;
      if (this.abort) this.abort.abort();
      this.abort = new AbortController();
      const root = this.root;
      root.setAttribute('aria-busy', 'true');

      try {
        const url = sectionUrl(productUrl, sectionId, { option_values: this.selectedOptionIds().join(',') });
        const doc = await fetchHTML(url, { signal: this.abort.signal });
        const nextRoot = doc.querySelector('[data-product-root]') || doc;
        root.querySelectorAll('[data-update]').forEach((el) => {
          const key = el.dataset.update;
          if (key === 'variant-picker' && el !== this) return;
          const next = nextRoot.querySelector(`[data-update="${key}"]`);
          if (!next) return;
          if (key === 'variant-picker') {
            this.innerHTML = next.innerHTML;
          } else {
            el.replaceWith(next);
          }
        });
        const json = this.querySelector('[data-selected-variant]');
        const variant = json ? JSON.parse(json.textContent) : null;
        const restored = focusedId && document.getElementById(focusedId);
        if (restored) restored.focus({ preventScroll: true });
        this.applyVariant(variant, root);
      } catch (error) {
        if (error.name !== 'AbortError') toast(strings.cartError);
      } finally {
        root.removeAttribute('aria-busy');
      }
    };

    applyVariant(variant, root) {
      root.querySelectorAll('[data-variant-id-input]').forEach((input) => {
        if (variant) {
          input.value = variant.id;
          input.disabled = !variant.available;
        } else {
          input.value = '';
          input.disabled = true;
        }
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      if (variant && this.dataset.updateUrl === 'true') {
        const url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        url.searchParams.delete('option_values');
        window.history.replaceState({}, '', url.toString());
      }
      if (variant && variant.featured_media && root !== document) {
        const slider = root.querySelector('[data-quick-view-slider]');
        const slide = slider && slider.querySelector(`[data-media-id="${variant.featured_media.id}"]`);
        if (slide) {
          slider.scrollTo({ left: isRTL() ? scrollToItemLeft(slider, slide) : slide.offsetLeft - slider.offsetLeft, behavior: reducedMotion() ? 'auto' : 'smooth' });
        }
      }
      const live = document.querySelector('[data-live-region]');
      if (live) {
        const priceEl = root.querySelector('[data-update="price"] .price__current');
        const price = priceEl ? priceEl.textContent.replace(/\s+/g, ' ').trim() : '';
        let status = '';
        if (!variant) status = strings.unavailable;
        else if (!variant.available) status = strings.soldOut;
        live.textContent = [price, status].filter(Boolean).join('. ');
      }
      document.dispatchEvent(
        new CustomEvent('variant:change', {
          detail: { sectionId: this.dataset.sectionId, variant, root, picker: this },
        })
      );
    }
  }
  customElements.define('variant-picker', VariantPicker);

  class ProductCard extends HTMLElement {
    connectedCallback() {
      this.slides = this.querySelector('[data-card-slides]');
      this.index = 0;
      this.addEventListener('click', this.onClick);
      this.addEventListener('pointerover', this.onHover);
      if (this.slides) this.addEventListener('pointerdown', this.onPointerDown);
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.onClick);
      this.removeEventListener('pointerover', this.onHover);
      this.removeEventListener('pointerdown', this.onPointerDown);
    }

    // Image arrows: show slide `index` (wrapping round) and load the one after it
    show(index) {
      const slides = this.slides.children;
      this.index = (index + slides.length) % slides.length;
      this.slides.style.setProperty('--card-slide', this.index);
      this.warm(this.index);
      this.warm(this.index + 1);
    }

    warm(index) {
      const slides = this.slides.children;
      const image = slides[index % slides.length].querySelector('img');
      if (image && image.loading === 'lazy') image.loading = 'eager';
    }

    preview(swatch) {
      const image = this.querySelector('.card__image--primary');
      if (!image || !swatch.dataset.srcset) return;
      image.srcset = swatch.dataset.srcset;
      if (this.slides && this.index !== 0) this.show(0);
    }

    onHover = (event) => {
      if (this.slides && event.pointerType === 'mouse' && !this.warmed) {
        this.warmed = true;
        this.warm(1);
      }
      const swatch = event.target.closest('[data-card-swatch]');
      if (swatch && event.pointerType === 'mouse') this.preview(swatch);
    };

    onPointerDown = (event) => {
      if (event.target.closest('[data-card-arrow]')) this.warm(this.index + Number(event.target.closest('[data-card-arrow]').dataset.cardArrow));
    };

    onClick = (event) => {
      const arrow = event.target.closest('[data-card-arrow]');
      if (arrow && this.slides) {
        event.preventDefault();
        this.show(this.index + Number(arrow.dataset.cardArrow));
        return;
      }
      const swatch = event.target.closest('[data-card-swatch]');
      if (!swatch) return;
      event.preventDefault();
      this.preview(swatch);
      this.querySelectorAll('[data-card-swatch]').forEach((el) => {
        el.classList.toggle('is-active', el === swatch);
        el.setAttribute('aria-pressed', el === swatch ? 'true' : 'false');
      });
      if (swatch.dataset.href) {
        this.querySelectorAll('[data-card-link]').forEach((link) => (link.href = swatch.dataset.href));
      }
    };
  }
  customElements.define('product-card', ProductCard);

  class CartGoals extends HTMLElement {
    connectedCallback() {
      const rate = window.Shopify && window.Shopify.currency ? parseFloat(window.Shopify.currency.rate) : 1;
      if (this.dataset.currency === this.dataset.shopCurrency || !rate || rate === 1) return;
      const total = parseInt(this.dataset.total, 10) || 0;
      const format = (cents) => {
        try {
          return new Intl.NumberFormat(document.documentElement.lang || undefined, {
            style: 'currency',
            currency: this.dataset.currency,
          }).format(cents / 100);
        } catch (e) {
          return (cents / 100).toFixed(2);
        }
      };
      this.querySelectorAll('[data-goal]').forEach((goal) => {
        const threshold = Math.round((parseInt(goal.dataset.threshold, 10) || 0) * rate);
        const remaining = Math.max(0, threshold - total);
        const message = goal.querySelector('[data-goal-message]');
        if (message) {
          message.innerHTML = remaining > 0 ? message.dataset.template.replace('[amount]', format(remaining)) : message.dataset.done;
        }
        const track = goal.querySelector('[data-goal-track]');
        if (track && threshold > 0) {
          const percent = Math.min(100, Math.round((total / threshold) * 100));
          track.setAttribute('aria-valuenow', percent);
          track.firstElementChild.style.setProperty('--progress', `${percent}%`);
        }
      });
    }
  }
  customElements.define('cart-goals', CartGoals);

  class PredictiveSearch extends HTMLElement {
    connectedCallback() {
      this.input = this.querySelector('input[type="search"]');
      this.container = this.querySelector('[data-predictive-container]');
      this.popular = this.querySelector('[data-search-popular]');
      this.reset = this.querySelector('[data-search-reset]');
      this.enabled = this.dataset.enabled === 'true' && routes.predictiveSearch;
      this.input.addEventListener('input', this.onInput);
      this.input.addEventListener('keydown', this.onKeydown);
      if (this.reset) this.reset.addEventListener('click', () => this.clear());
      const dialog = this.closest('dialog');
      if (dialog) {
        dialog.addEventListener('dialog:open', () => {
          const header = document.querySelector('.header-wrapper');
          const top = header && window.matchMedia('(max-width: 989px)').matches ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
          dialog.style.setProperty('--search-top', `${Math.round(top)}px`);
          setTimeout(() => this.input.focus(), 60);
        });
      }
    }

    clear() {
      this.container.innerHTML = '';
      if (this.popular) this.popular.hidden = false;
      if (this.reset) this.reset.hidden = true;
      this.input.setAttribute('aria-expanded', 'false');
      this.input.focus();
    }

    onInput = debounce(() => {
      const terms = this.input.value.trim();
      if (this.reset) this.reset.hidden = terms.length === 0;
      if (!terms) {
        this.clear();
        return;
      }
      if (!this.enabled) return;
      this.search(terms);
    }, 250);

    async search(terms) {
      if (this.abort) this.abort.abort();
      this.abort = new AbortController();
      const params = new URLSearchParams({
        q: terms,
        section_id: 'predictive-search',
        'resources[type]': 'product,collection,query,page,article',
        'resources[limit]': '6',
        'resources[options][unavailable_products]': 'last',
        'resources[options][fields]': 'title,product_type,variants.title,vendor,tag',
      });
      try {
        const doc = await fetchHTML(`${routes.predictiveSearch}?${params.toString()}`, { signal: this.abort.signal });
        const results = doc.querySelector('[data-predictive-results]');
        if (!results) return;
        this.container.replaceChildren(results);
        if (this.popular) this.popular.hidden = true;
        this.input.setAttribute('aria-expanded', 'true');
      } catch (error) {
        if (error.name !== 'AbortError') this.container.innerHTML = '';
      }
    }

    onKeydown = (event) => {
      if (event.key !== 'ArrowDown') return;
      const first = this.container.querySelector('[data-predictive-item]');
      if (first) {
        event.preventDefault();
        first.focus();
      }
    };
  }
  customElements.define('predictive-search', PredictiveSearch);

  document.addEventListener('keydown', (event) => {
    const item = event.target.closest && event.target.closest('[data-predictive-item]');
    if (!item || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    const root = item.closest('[data-predictive-results]');
    const items = [...root.querySelectorAll('[data-predictive-item]')];
    const index = items.indexOf(item);
    event.preventDefault();
    if (event.key === 'ArrowDown') {
      (items[index + 1] || items[0]).focus();
    } else if (index === 0) {
      const search = item.closest('predictive-search');
      const input = search && search.querySelector('input[type="search"]');
      if (input) input.focus();
    } else {
      items[index - 1].focus();
    }
  });

  class LocalizationForm extends HTMLElement {
    connectedCallback() {
      this.addEventListener('change', (event) => {
        if (event.target.matches('select')) this.querySelector('form').submit();
      });
    }
  }
  customElements.define('localization-form', LocalizationForm);

  class CarouselSlider extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-carousel-track]');
      if (!this.track) return;
      this.prev = this.querySelector('[data-carousel-prev]');
      this.next = this.querySelector('[data-carousel-next]');
      this.nav = this.querySelector('.carousel__nav');
      this.progress = this.querySelector('.carousel__progress');
      if (this.prev) this.prev.addEventListener('click', () => this.go(-1));
      if (this.next) this.next.addEventListener('click', () => this.go(1));
      this.track.addEventListener('scroll', this.update, { passive: true });
      this.resizeObserver = new ResizeObserver(this.update);
      this.resizeObserver.observe(this.track);
      this.update();
    }

    disconnectedCallback() {
      if (this.resizeObserver) this.resizeObserver.disconnect();
    }

    go(direction) {
      const item = this.track.firstElementChild;
      const step = item ? item.getBoundingClientRect().width + parseFloat(getComputedStyle(this.track).columnGap || 0) : this.track.clientWidth;
      const visible = Math.max(1, Math.floor((this.track.clientWidth + 1) / step));
      this.track.scrollBy({ left: (isRTL() ? -direction : direction) * step * visible, behavior: reducedMotion() ? 'auto' : 'smooth' });
    }

    update = () => {
      const max = this.track.scrollWidth - this.track.clientWidth;
      const left = Math.abs(this.track.scrollLeft);
      if (this.prev) this.prev.disabled = left <= 2;
      if (this.next) this.next.disabled = left >= max - 2;
      const overflow = max > 2 ? 'true' : 'false';
      // Everything fits: CSS drops the peek gap and the progress bar
      if (this.dataset.overflow !== overflow) this.dataset.overflow = overflow;
      if (this.nav) this.nav.dataset.overflow = overflow;
      if (this.progress) {
        const thumb = max > 0 ? (this.track.clientWidth / this.track.scrollWidth) * 100 : 100;
        const offset = max > 0 ? (left / max) * (100 / thumb) * (100 - thumb) : 0;
        this.progress.style.setProperty('--carousel-thumb', `${thumb}%`);
        this.progress.style.setProperty('--carousel-offset', `${offset}%`);
      }
    };
  }
  customElements.define('carousel-slider', CarouselSlider);

  class CountdownTimer extends HTMLElement {
    connectedCallback() {
      const raw = (this.dataset.end || '').trim().replace(' ', 'T');
      this.end = Date.parse(raw);
      if (Number.isNaN(this.end)) {
        this.hidden = true;
        return;
      }
      this.parts = {
        days: this.querySelector('[data-days]'),
        hours: this.querySelector('[data-hours]'),
        minutes: this.querySelector('[data-minutes]'),
        seconds: this.querySelector('[data-seconds]'),
      };
      this.tick();
      this.timer = setInterval(() => this.tick(), 1000);
    }

    disconnectedCallback() {
      clearInterval(this.timer);
    }

    tick() {
      const diff = Math.max(0, this.end - Date.now());
      const s = Math.floor(diff / 1000);
      const values = {
        days: Math.floor(s / 86400),
        hours: Math.floor((s % 86400) / 3600),
        minutes: Math.floor((s % 3600) / 60),
        seconds: s % 60,
      };
      Object.entries(this.parts).forEach(([key, el]) => {
        if (el) el.textContent = String(values[key]).padStart(2, '0');
      });
      if (diff === 0) {
        clearInterval(this.timer);
        this.classList.add('is-expired');
        if (this.dataset.expired === 'hide') {
          const target = this.closest('[data-countdown-container]') || this;
          target.hidden = true;
        }
      }
    }
  }
  customElements.define('countdown-timer', CountdownTimer);

  class SiteHeader extends HTMLElement {
    connectedCallback() {
      this.wrapper = this.closest('.header-wrapper') || this;
      this.sticky = this.dataset.sticky || 'none';
      this.transparent = this.dataset.transparent === 'true';
      this.lastY = window.scrollY;
      this.setOffset();
      window.addEventListener('scroll', this.onScroll, { passive: true });
      window.addEventListener('resize', this.setOffset, { passive: true });
      this.onScroll();
      this.items = [...this.querySelectorAll('[data-menu-item]')];
      this.items.forEach((item) => this.bindItem(item));
      document.addEventListener('keydown', this.onKeydown);
      this.addEventListener('shopify:block:select', (event) => {
        const item = event.target.closest('[data-menu-item]');
        if (item) this.open(item);
      });
      this.addEventListener('shopify:block:deselect', (event) => {
        const item = event.target.closest('[data-menu-item]');
        if (item) this.close(item);
      });
    }

    disconnectedCallback() {
      window.removeEventListener('scroll', this.onScroll);
      window.removeEventListener('resize', this.setOffset);
      document.removeEventListener('keydown', this.onKeydown);
    }

    setOffset = () => {
      const height = this.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--header-offset', this.sticky === 'none' ? '0px' : `${height}px`);
      document.documentElement.style.setProperty('--header-bottom', `${this.getBoundingClientRect().bottom}px`);
      document.documentElement.style.setProperty('--header-overlay', this.transparent ? `${height}px` : '0px');
    };

    onScroll = () => {
      const y = window.scrollY;
      if (this.transparent) this.wrapper.classList.toggle('is-solid', y > 10 || this.hasOpenMenu());
      if (this.sticky === 'scroll-up') {
        const hidden = y > this.lastY && y > this.offsetHeight * 2 && !this.hasOpenMenu();
        this.wrapper.classList.toggle('is-hidden', hidden);
      }
      this.wrapper.classList.toggle('is-scrolled', y > 10);
      this.lastY = y;
    };

    hasOpenMenu() {
      return !!this.querySelector('[data-menu-item].is-open');
    }

    bindItem(item) {
      const trigger = item.querySelector('[data-menu-trigger]');
      const panel = item.querySelector('[data-menu-panel]');
      if (!trigger || !panel) return;
      let timer;
      const fine = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      item.addEventListener('pointerenter', () => {
        if (!fine()) return;
        clearTimeout(timer);
        timer = setTimeout(() => this.open(item), 80);
      });
      item.addEventListener('pointerleave', () => {
        if (!fine()) return;
        clearTimeout(timer);
        timer = setTimeout(() => this.close(item), 160);
      });
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        item.classList.contains('is-open') ? this.close(item) : this.open(item);
      });
      item.addEventListener('focusout', (event) => {
        if (!item.contains(event.relatedTarget)) this.close(item);
      });
    }

    open(item) {
      this.items.forEach((other) => other !== item && this.close(other));
      item.classList.add('is-open');
      const trigger = item.querySelector('[data-menu-trigger]');
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
      this.wrapper.classList.add('menu-open');
      if (this.transparent) this.wrapper.classList.add('is-solid');
    }

    close(item) {
      if (!item.classList.contains('is-open')) return;
      item.classList.remove('is-open');
      const trigger = item.querySelector('[data-menu-trigger]');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      if (!this.hasOpenMenu()) {
        this.wrapper.classList.remove('menu-open');
        this.onScroll();
      }
    }

    onKeydown = (event) => {
      if (event.key !== 'Escape') return;
      const open = this.querySelector('[data-menu-item].is-open');
      if (!open) return;
      this.close(open);
      const trigger = open.querySelector('[data-menu-trigger]');
      if (trigger) trigger.focus();
    };
  }
  customElements.define('site-header', SiteHeader);

  class AnnouncementBar extends HTMLElement {
    connectedCallback() {
      const bar = this.closest('.announcement-bar--sticky');
      if (bar && 'ResizeObserver' in window) {
        this.heightObserver = new ResizeObserver(() => {
          document.documentElement.style.setProperty('--announcement-height', `${bar.offsetHeight}px`);
        });
        this.heightObserver.observe(bar);
      }
      this.slides = [...this.querySelectorAll('[data-announcement]')];
      this.index = Math.max(0, this.slides.findIndex((s) => !s.hidden));
      this.querySelectorAll('[data-announcement-prev]').forEach((b) => b.addEventListener('click', () => this.show(this.index - 1, true)));
      this.querySelectorAll('[data-announcement-next]').forEach((b) => b.addEventListener('click', () => this.show(this.index + 1, true)));
      const pause = this.querySelector('[data-announcement-pause]');
      if (pause) {
        pause.addEventListener('click', () => {
          this.userPaused = !this.userPaused;
          pause.setAttribute('aria-pressed', this.userPaused ? 'true' : 'false');
          pause.setAttribute('aria-label', this.userPaused ? pause.dataset.labelPlay : pause.dataset.labelPause);
          pause.classList.toggle('is-paused', this.userPaused);
        });
      }
      this.addEventListener('pointerenter', () => (this.paused = true));
      this.addEventListener('pointerleave', () => (this.paused = false));
      this.addEventListener('focusin', () => (this.paused = true));
      this.addEventListener('focusout', () => (this.paused = false));
      const speed = parseInt(this.dataset.speed, 10) || 0;
      if (this.slides.length > 1 && speed > 0 && !reducedMotion()) {
        this.timer = setInterval(() => !this.paused && !this.userPaused && this.show(this.index + 1), speed * 1000);
      }
      this.addEventListener('shopify:block:select', (event) => {
        this.paused = true;
        const i = this.slides.indexOf(event.target);
        if (i > -1) this.show(i);
      });
      this.addEventListener('shopify:block:deselect', () => (this.paused = false));
    }

    disconnectedCallback() {
      clearInterval(this.timer);
      if (this.heightObserver) this.heightObserver.disconnect();
    }

    show(i) {
      if (!this.slides.length) return;
      this.index = (i + this.slides.length) % this.slides.length;
      this.slides.forEach((slide, k) => {
        slide.hidden = k !== this.index;
      });
    }
  }
  customElements.define('announcement-bar', AnnouncementBar);

  const initReveal = () => {
    if (!document.body.classList.contains('has-reveal')) return;
    const items = document.querySelectorAll('.reveal:not(.is-revealed)');
    if (!items.length) return;
    if (reducedMotion() || (window.Shopify && window.Shopify.designMode) || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-revealed'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px' }
    );
    items.forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) {
        el.classList.add('is-revealed');
      } else {
        observer.observe(el);
      }
    });
  };

  document.addEventListener('DOMContentLoaded', initReveal);
  document.addEventListener('shopify:section:load', initReveal);

  // After a form inside a dialog posts, Shopify reloads the page with #FormId; reopen that dialog to show the result
  const reopenPostedDialog = () => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const form = document.getElementById(id);
    const dialog = form && form.tagName === 'FORM' ? form.closest('dialog') : null;
    if (!dialog || dialog.open) return;
    openDialog(dialog);
    const message = dialog.querySelector('[role="status"], [role="alert"]');
    if (message) {
      if (!message.hasAttribute('tabindex')) message.setAttribute('tabindex', '-1');
      message.focus();
    }
  };

  const initBackToTop = () => {
    const button = document.querySelector('[data-back-to-top]');
    if (!button) return;
    const toggle = () => {
      button.hidden = window.scrollY < window.innerHeight * 1.5;
    };
    window.addEventListener('scroll', toggle, { passive: true });
    toggle();
    button.addEventListener('click', (event) => {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      const main = document.getElementById('MainContent');
      if (main) main.focus({ preventScroll: true });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      reopenPostedDialog();
      initBackToTop();
    });
  } else {
    reopenPostedDialog();
    initBackToTop();
  }

  document.addEventListener('shopify:block:select', (event) => {
    const block = event.target;
    const details = block.matches('details') ? block : block.closest('details');
    if (details && !details.closest('[data-menu-item]')) details.open = true;
    const track = block.closest('[data-carousel-track]');
    if (track) {
      const slide = [...track.children].find((child) => child.contains(block));
      if (slide) track.scrollTo({ left: isRTL() ? scrollToItemLeft(track, slide) : slide.offsetLeft - track.offsetLeft, behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  });

  document.addEventListener('shopify:section:load', (event) => {
    if (event.target.id === 'shopify-section-cart-drawer') {
      const drawer = document.getElementById('CartDrawer');
      if (drawer) openDialog(drawer);
    }
  });

  const scriptBundles = [
    {
      key: 'product',
      selector: 'product-page, fbt-bundle, product-gallery, lightbox-viewer, sticky-atc, pickup-availability, product-recommendations, recently-viewed, product-tabs, share-button',
    },
    {
      key: 'compare',
      selector: 'compare-toggle, compare-tray',
    },
    {
      key: 'wishlist',
      selector: 'wishlist-toggle, wishlist-drawer',
    },
    {
      key: 'sections',
      selector: 'slide-show, shoppable-videos, hero-video-toggle, collection-tabs, shop-the-look, marquee-text, copy-code, lazy-video, .newsletter, newsletter-popup, before-after',
    },
  ];
  const loadedBundles = new Set();

  const loadBundles = (root = document) => {
    const sources = theme.scripts || {};
    scriptBundles.forEach(({ key, selector }) => {
      if (loadedBundles.has(key) || !sources[key]) return;
      if (!root.querySelector(selector)) return;
      loadedBundles.add(key);
      const script = document.createElement('script');
      script.src = sources[key];
      document.head.appendChild(script);
    });
  };

  loadBundles();
  document.addEventListener('shopify:section:load', (event) => loadBundles(event.target));

  document.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Spacebar') return;
    const link = event.target.closest && event.target.closest('a[role="button"]');
    if (!link) return;
    event.preventDefault();
    link.click();
  });

  theme.utils = { debounce, fetchHTML, parseHTML, sectionUrl, reducedMotion, isRTL, scrollToItemLeft };
  theme.toast = toast;
  theme.cart = cart;
  theme.openDialog = openDialog;
  theme.closeDialog = closeDialog;
  theme.quickView = quickView;
})();
