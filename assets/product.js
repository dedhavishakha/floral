(() => {
  const RECENT_KEY = 'theme:recently-viewed';

  const utils = () => (window.theme && window.theme.utils) || {};
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior = () => (reducedMotion() ? 'auto' : 'smooth');
  const isRTL = () => document.documentElement.dir === 'rtl';
  // scrollLeft that brings item's inline-start edge to the track's inline-start edge
  const scrollToItemLeft = (track, item) => {
    const a = item.getBoundingClientRect();
    const b = track.getBoundingClientRect();
    return track.scrollLeft + (isRTL() ? a.right - b.right : a.left - b.left);
  };
  const centerOffset = (track, item) => {
    const a = item.getBoundingClientRect();
    const b = track.getBoundingClientRect();
    return a.left + a.width / 2 - (b.left + b.width / 2);
  };
  const startGap = (track, item) =>
    Math.abs(isRTL() ? item.getBoundingClientRect().right - track.getBoundingClientRect().right : item.offsetLeft - track.scrollLeft);

  const fetchDoc = async (url) => {
    if (utils().fetchHTML) return utils().fetchHTML(url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return new DOMParser().parseFromString(await response.text(), 'text/html');
  };

  const rootUrl = (value) => {
    const root = value || (window.theme && window.theme.routes && window.theme.routes.root) || '/';
    return root.endsWith('/') ? root : `${root}/`;
  };

  const handleize = (value) =>
    String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const revealIn = (scope) => {
    scope.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-revealed'));
  };

  const readRecent = () => {
    try {
      const list = JSON.parse(window.localStorage.getItem(RECENT_KEY));
      return Array.isArray(list) ? list : [];
    } catch (error) {
      return [];
    }
  };

  const writeRecent = (list) => {
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 20)));
    } catch (error) {
      return;
    }
  };

  class ProductPage extends HTMLElement {
    connectedCallback() {
      const handle = this.dataset.productHandle;
      if (!handle || (window.Shopify && window.Shopify.designMode)) return;
      writeRecent([handle, ...readRecent().filter((h) => h !== handle)]);
    }
  }
  if (!customElements.get('product-page')) customElements.define('product-page', ProductPage);

  class ProductGallery extends HTMLElement {
    connectedCallback() {
      this.slider = this.querySelector('[data-gallery-slider]');
      if (!this.slider) return;
      this.sectionId = this.dataset.sectionId;
      this.colorIndex = parseInt(this.dataset.colorIndex, 10);
      this.prevButton = this.querySelector('[data-gallery-prev]');
      this.nextButton = this.querySelector('[data-gallery-next]');
      this.currentEl = this.querySelector('[data-gallery-current]');
      this.totalEl = this.querySelector('[data-gallery-total]');
      this.thumbs = this.querySelector('[data-gallery-thumbs]');
      this.lightbox = this.querySelector('dialog.lightbox');
      const map = this.querySelector('[data-color-handles]');
      try {
        this.colorHandles = map ? JSON.parse(map.textContent) : {};
      } catch (error) {
        this.colorHandles = {};
      }
      const first = this.visibleItems()[0];
      this.activeId = first ? first.dataset.mediaId : null;

      this.slider.addEventListener('scroll', this.onScroll, { passive: true });
      this.addEventListener('click', this.onClick);
      this.slider.addEventListener('keydown', this.onKeydown);
      if (this.dataset.hoverZoom === 'true') {
        this.slider.addEventListener('pointermove', this.onPointerMove);
        this.slider.addEventListener('pointerleave', this.onPointerLeave);
      }
      document.addEventListener('variant:change', this.onVariantChange);
      this.loadModels();
      this.update();
    }

    disconnectedCallback() {
      document.removeEventListener('variant:change', this.onVariantChange);
    }

    items() {
      return [...this.slider.querySelectorAll('[data-gallery-item]')];
    }

    visibleItems() {
      return this.items().filter((item) => !item.hidden);
    }

    isScrollable() {
      return this.slider.scrollWidth > this.slider.clientWidth + 2;
    }

    activeIndex() {
      const items = this.visibleItems();
      if (this.isScrollable()) {
        let best = 0;
        let distance = Infinity;
        items.forEach((item, index) => {
          const d = startGap(this.slider, item);
          if (d < distance) {
            distance = d;
            best = index;
          }
        });
        return best;
      }
      const index = items.findIndex((item) => item.dataset.mediaId === this.activeId);
      return index < 0 ? 0 : index;
    }

    onScroll = () => {
      if (this.scrollFrame) return;
      this.scrollFrame = requestAnimationFrame(() => {
        this.scrollFrame = null;
        const item = this.visibleItems()[this.activeIndex()];
        if (item) this.activeId = item.dataset.mediaId;
        this.update();
      });
    };

    update() {
      const items = this.visibleItems();
      const index = this.activeIndex();
      if (this.currentEl) this.currentEl.textContent = String(Math.min(index + 1, items.length));
      if (this.totalEl) this.totalEl.textContent = String(items.length);
      if (this.prevButton) this.prevButton.disabled = index <= 0;
      if (this.nextButton) this.nextButton.disabled = index >= items.length - 1;
      this.classList.toggle('gallery--single', items.length < 2);
      if (this.thumbs) {
        this.thumbs.querySelectorAll('[data-gallery-thumb]').forEach((thumb) => {
          thumb.setAttribute('aria-current', thumb.dataset.galleryThumb === this.activeId ? 'true' : 'false');
        });
        const active = this.thumbs.querySelector('[aria-current="true"]');
        if (active && this.thumbs.scrollHeight > this.thumbs.clientHeight + 2) {
          const top = active.offsetTop - this.thumbs.clientHeight / 2 + active.offsetHeight / 2;
          this.thumbs.scrollTo({ top, behavior: behavior() });
        } else if (active && this.thumbs.scrollWidth > this.thumbs.clientWidth + 2) {
          const left = isRTL()
            ? this.thumbs.scrollLeft + centerOffset(this.thumbs, active)
            : active.offsetLeft - this.thumbs.clientWidth / 2 + active.offsetWidth / 2;
          this.thumbs.scrollTo({ left, behavior: behavior() });
        }
      }
      if (this.isScrollable()) this.pauseInactive(items[index]);
    }

    pauseInactive(activeItem) {
      this.items().forEach((item) => {
        if (item === activeItem) return;
        item.querySelectorAll('video').forEach((video) => video.pause());
        item.querySelectorAll('iframe').forEach((frame) => {
          if (!frame.contentWindow) return;
          frame.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
          frame.contentWindow.postMessage('{"method":"pause"}', '*');
        });
      });
    }

    show(mediaId, scrollBehavior = behavior()) {
      const item = this.slider.querySelector(`[data-gallery-item][data-media-id="${mediaId}"]`);
      if (!item || item.hidden) return;
      this.activeId = String(mediaId);
      if (this.isScrollable()) {
        this.slider.scrollTo({ left: isRTL() ? scrollToItemLeft(this.slider, item) : item.offsetLeft, behavior: scrollBehavior });
      } else if (this.dataset.layout === 'grid') {
        const firstVisible = this.visibleItems()[0];
        if (firstVisible && firstVisible !== item) {
          this.slider.prepend(item);
          if (this.thumbs) {
            const thumb = this.thumbs.querySelector(`[data-gallery-thumb-item][data-media-id="${mediaId}"]`);
            if (thumb) this.thumbs.prepend(thumb);
          }
        }
      }
      this.update();
    }

    step(direction) {
      const items = this.visibleItems();
      const target = items[Math.max(0, Math.min(items.length - 1, this.activeIndex() + direction))];
      if (target) this.show(target.dataset.mediaId);
    }

    filterByColor(value) {
      const handle = this.colorHandles[value] || handleize(value);
      if (!handle) return;
      const prefix = `${handle}-`;
      const items = this.items();
      const matching = items.filter((item) => {
        const alt = item.dataset.mediaAlt || '';
        return alt === handle || alt.startsWith(prefix);
      });
      const visibleIds = new Set((matching.length ? matching : items).map((item) => item.dataset.mediaId));
      items.forEach((item) => {
        item.hidden = !visibleIds.has(item.dataset.mediaId);
      });
      this.querySelectorAll('[data-gallery-thumb-item], [data-lightbox-item]').forEach((el) => {
        el.hidden = !visibleIds.has(el.dataset.mediaId);
      });
      this.slider.scrollTo({ left: 0, behavior: 'auto' });
      const first = this.visibleItems()[0];
      this.activeId = first ? first.dataset.mediaId : null;
    }

    onVariantChange = (event) => {
      const detail = event.detail || {};
      if (detail.sectionId !== this.sectionId || !detail.variant) return;
      const variant = detail.variant;
      if (this.dataset.groupByColor === 'true' && this.colorIndex >= 0 && variant.options) {
        this.filterByColor(variant.options[this.colorIndex]);
      }
      if (variant.featured_media) {
        this.show(variant.featured_media.id);
      } else {
        this.update();
      }
    };

    onClick = (event) => {
      if (event.target.closest('[data-gallery-prev]')) {
        this.step(-1);
        return;
      }
      if (event.target.closest('[data-gallery-next]')) {
        this.step(1);
        return;
      }
      const thumb = event.target.closest('[data-gallery-thumb]');
      if (thumb) {
        this.show(thumb.dataset.galleryThumb);
        return;
      }
      const opener = event.target.closest('[data-lightbox-open]');
      if (opener && this.lightbox) {
        event.preventDefault();
        if (window.theme && window.theme.openDialog) {
          window.theme.openDialog(this.lightbox, opener);
        } else {
          this.lightbox.showModal();
        }
        const viewer = this.lightbox.querySelector('lightbox-viewer');
        if (viewer && viewer.goTo) viewer.goTo(opener.dataset.lightboxOpen);
      }
    };

    onKeydown = (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (!this.isScrollable()) return;
      event.preventDefault();
      this.step(event.key === 'ArrowLeft' ? -1 : 1);
    };

    onPointerMove = (event) => {
      if (event.pointerType !== 'mouse') return;
      const frame = event.target.closest('.gallery__zoomable');
      if (this.zoomed && this.zoomed !== frame) this.zoomed.classList.remove('is-zoomed');
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      frame.style.setProperty('--zoom-x', `${((event.clientX - rect.left) / rect.width) * 100}%`);
      frame.style.setProperty('--zoom-y', `${((event.clientY - rect.top) / rect.height) * 100}%`);
      frame.classList.add('is-zoomed');
      this.zoomed = frame;
    };

    onPointerLeave = () => {
      if (this.zoomed) this.zoomed.classList.remove('is-zoomed');
      this.zoomed = null;
    };

    loadModels() {
      const json = this.querySelector('[data-product-models]');
      if (!json || !window.Shopify || typeof window.Shopify.loadFeatures !== 'function') return;
      const setupXR = (errors) => {
        if (errors) return;
        if (!window.ShopifyXR) {
          document.addEventListener('shopify_xr_initialized', () => setupXR(), { once: true });
          return;
        }
        window.ShopifyXR.addModels(JSON.parse(json.textContent));
        window.ShopifyXR.setupXRElements();
      };
      window.Shopify.loadFeatures([
        { name: 'shopify-xr', version: '1.0', onLoad: setupXR },
        {
          name: 'model-viewer-ui',
          version: '1.0',
          onLoad: (errors) => {
            if (errors || !window.Shopify.ModelViewerUI) return;
            this.querySelectorAll('model-viewer').forEach((viewer) => {
              if (!viewer.modelViewerUI) viewer.modelViewerUI = new window.Shopify.ModelViewerUI(viewer);
            });
          },
        },
      ]);
    }
  }
  if (!customElements.get('product-gallery')) customElements.define('product-gallery', ProductGallery);

  class LightboxViewer extends HTMLElement {
    connectedCallback() {
      this.slider = this.querySelector('[data-lightbox-slider]');
      this.counter = this.querySelector('[data-lightbox-counter]');
      this.dialog = this.closest('dialog');
      if (!this.slider) return;
      this.addEventListener('click', this.onClick);
      this.addEventListener('pointermove', this.onPointerMove);
      this.slider.addEventListener('scroll', this.onScroll, { passive: true });
      if (this.dialog) {
        this.dialog.addEventListener('keydown', this.onKeydown);
        this.dialog.addEventListener('close', () => this.resetZoom());
      }
    }

    items() {
      return [...this.slider.querySelectorAll('[data-lightbox-item]')].filter((item) => !item.hidden);
    }

    index() {
      const items = this.items();
      let best = 0;
      let distance = Infinity;
      items.forEach((item, i) => {
        const d = startGap(this.slider, item);
        if (d < distance) {
          distance = d;
          best = i;
        }
      });
      return best;
    }

    goTo(mediaId) {
      const items = this.items();
      const item = items.find((el) => el.dataset.mediaId === String(mediaId)) || items[0];
      if (!item) return;
      this.resetZoom();
      this.slider.scrollTo({ left: isRTL() ? scrollToItemLeft(this.slider, item) : item.offsetLeft, behavior: 'auto' });
      this.updateCounter(items.indexOf(item));
    }

    step(direction) {
      const items = this.items();
      const target = items[(this.index() + direction + items.length) % items.length];
      if (!target) return;
      this.resetZoom();
      this.slider.scrollTo({ left: isRTL() ? scrollToItemLeft(this.slider, target) : target.offsetLeft, behavior: behavior() });
    }

    updateCounter(index = this.index()) {
      const total = this.items().length;
      if (this.counter) this.counter.textContent = `${Math.min(index + 1, total)} / ${total}`;
    }

    onScroll = () => {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.updateCounter();
      });
    };

    setOrigin(frame, event) {
      const rect = frame.getBoundingClientRect();
      frame.style.setProperty('--zoom-x', `${((event.clientX - rect.left) / rect.width) * 100}%`);
      frame.style.setProperty('--zoom-y', `${((event.clientY - rect.top) / rect.height) * 100}%`);
    }

    resetZoom() {
      this.querySelectorAll('[data-lightbox-zoom].is-zoomed').forEach((frame) => {
        frame.classList.remove('is-zoomed');
        frame.setAttribute('aria-pressed', 'false');
      });
      if (this.slider) this.slider.classList.remove('is-zoomed');
    }

    onClick = (event) => {
      if (event.target.closest('[data-lightbox-prev]')) {
        this.step(-1);
        return;
      }
      if (event.target.closest('[data-lightbox-next]')) {
        this.step(1);
        return;
      }
      const frame = event.target.closest('[data-lightbox-zoom]');
      if (!frame) return;
      const zoomed = !frame.classList.contains('is-zoomed');
      if (zoomed && event.clientX) this.setOrigin(frame, event);
      frame.classList.toggle('is-zoomed', zoomed);
      frame.setAttribute('aria-pressed', zoomed ? 'true' : 'false');
      this.slider.classList.toggle('is-zoomed', zoomed);
    };

    onPointerMove = (event) => {
      const frame = event.target.closest('[data-lightbox-zoom].is-zoomed');
      if (frame) this.setOrigin(frame, event);
    };

    onKeydown = (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.step(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.step(1);
      }
    };
  }
  if (!customElements.get('lightbox-viewer')) customElements.define('lightbox-viewer', LightboxViewer);

  class StickyAtc extends HTMLElement {
    connectedCallback() {
      const root = this.closest('[data-product-root]');
      this.target = root && root.querySelector('[data-main-buy-buttons]');
      if (!this.target || !('IntersectionObserver' in window)) return;
      this.observer = new IntersectionObserver(([entry]) => {
        this.toggle(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      });
      this.observer.observe(this.target);
      const error = this.target.querySelector('[data-form-error]');
      if (error && 'MutationObserver' in window) {
        this.errorObserver = new MutationObserver(() => {
          if (!error.hidden && this.classList.contains('is-visible') && window.theme && window.theme.toast) {
            window.theme.toast(error.textContent);
          }
        });
        this.errorObserver.observe(error, { attributes: true, attributeFilter: ['hidden'] });
      }
    }

    disconnectedCallback() {
      if (this.observer) this.observer.disconnect();
      if (this.errorObserver) this.errorObserver.disconnect();
      document.body.classList.remove('has-sticky-atc');
    }

    toggle(show) {
      this.classList.toggle('is-visible', show);
      this.inert = !show;
      document.body.classList.toggle('has-sticky-atc', show);
    }
  }
  if (!customElements.get('sticky-atc')) customElements.define('sticky-atc', StickyAtc);

  class PickupAvailability extends HTMLElement {
    connectedCallback() {
      if (!this.dataset.variantId || this.dataset.available !== 'true') {
        this.hidden = true;
        return;
      }
      this.load();
    }

    async load() {
      const url = `${rootUrl(this.dataset.rootUrl)}variants/${this.dataset.variantId}/?section_id=pickup-availability`;
      try {
        const doc = await fetchDoc(url);
        const content = doc.querySelector('[data-pickup-content]');
        if (!content || !content.children.length) {
          this.hidden = true;
          return;
        }
        this.replaceChildren(content);
        this.hidden = false;
      } catch (error) {
        this.hidden = true;
      }
    }
  }
  if (!customElements.get('pickup-availability')) customElements.define('pickup-availability', PickupAvailability);

  class ProductRecommendations extends HTMLElement {
    connectedCallback() {
      if (this.querySelector('[data-recommendations-content]')) {
        this.classList.add('is-loaded');
        return;
      }
      if (!this.dataset.url || this.dataset.url.includes('product_id=&')) return;
      if (!('IntersectionObserver' in window)) {
        this.load();
        return;
      }
      this.observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          this.observer.disconnect();
          this.load();
        },
        { rootMargin: '0px 0px 400px 0px' }
      );
      this.observer.observe(this);
    }

    disconnectedCallback() {
      if (this.observer) this.observer.disconnect();
    }

    async load() {
      try {
        const doc = await fetchDoc(this.dataset.url);
        const id = window.CSS && CSS.escape ? CSS.escape(this.dataset.recommendationsId) : this.dataset.recommendationsId;
        const match = doc.querySelector(`product-recommendations[data-recommendations-id="${id}"]`);
        if (!match || !match.querySelector('[data-recommendations-content]')) {
          this.hidden = true;
          return;
        }
        this.innerHTML = match.innerHTML;
        this.classList.add('is-loaded');
        requestAnimationFrame(() => revealIn(this));
      } catch (error) {
        this.hidden = true;
      }
    }
  }
  if (!customElements.get('product-recommendations')) customElements.define('product-recommendations', ProductRecommendations);

  class RecentlyViewed extends HTMLElement {
    connectedCallback() {
      this.list = this.querySelector('[data-recently-viewed-list]');
      if (!this.list) return;
      const limit = parseInt(this.dataset.limit, 10) || 6;
      const exclude = this.dataset.exclude;
      this.handles = readRecent()
        .filter((handle) => handle && handle !== exclude)
        .slice(0, limit);
      if (!this.handles.length) return;
      if (!('IntersectionObserver' in window)) {
        this.load();
        return;
      }
      this.observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          this.observer.disconnect();
          this.load();
        },
        { rootMargin: '0px 0px 400px 0px' }
      );
      this.hidden = false;
      this.classList.add('is-pending');
      this.observer.observe(this);
    }

    disconnectedCallback() {
      if (this.observer) this.observer.disconnect();
    }

    async load() {
      const base = rootUrl(this.dataset.rootUrl);
      const failed = [];
      const cards = await Promise.all(
        this.handles.map((handle) =>
          fetchDoc(`${base}products/${encodeURIComponent(handle)}?section_id=product-card-ajax`)
            .then((doc) => doc.querySelector('.card'))
            .catch(() => {
              failed.push(handle);
              return null;
            })
        )
      );
      if (failed.length) writeRecent(readRecent().filter((handle) => !failed.includes(handle)));
      const found = cards.filter(Boolean);
      this.classList.remove('is-pending');
      if (!found.length) {
        if (!(window.Shopify && window.Shopify.designMode)) this.hidden = true;
        return;
      }
      const fragment = document.createDocumentFragment();
      found.forEach((card) => {
        const item = document.createElement('li');
        item.append(card);
        fragment.append(item);
      });
      this.list.replaceChildren(fragment);
      const empty = this.querySelector('[data-recently-viewed-empty]');
      if (empty) empty.hidden = true;
      this.hidden = false;
      this.list.dispatchEvent(new Event('scroll'));
    }
  }
  if (!customElements.get('recently-viewed')) customElements.define('recently-viewed', RecentlyViewed);

  class ProductTabs extends HTMLElement {
    connectedCallback() {
      this.tabs = [...this.querySelectorAll('[role="tab"]')];
      if (!this.tabs.length) return;
      this.addEventListener('click', (event) => {
        const tab = event.target.closest('[role="tab"]');
        if (tab && this.contains(tab)) this.select(tab);
      });
      this.addEventListener('keydown', (event) => {
        const index = this.tabs.indexOf(event.target);
        if (index < 0) return;
        let next = null;
        if (event.key === 'ArrowRight') next = this.tabs[(index + 1) % this.tabs.length];
        if (event.key === 'ArrowLeft') next = this.tabs[(index - 1 + this.tabs.length) % this.tabs.length];
        if (event.key === 'Home') next = this.tabs[0];
        if (event.key === 'End') next = this.tabs[this.tabs.length - 1];
        if (!next) return;
        event.preventDefault();
        this.select(next);
        next.focus();
      });
    }

    select(tab) {
      this.tabs.forEach((item) => {
        const active = item === tab;
        item.setAttribute('aria-selected', active ? 'true' : 'false');
        item.tabIndex = active ? 0 : -1;
        const panel = document.getElementById(item.getAttribute('aria-controls'));
        if (panel) panel.hidden = !active;
      });
    }
  }
  if (!customElements.get('product-tabs')) customElements.define('product-tabs', ProductTabs);

  class ShareButton extends HTMLElement {
    connectedCallback() {
      this.button = this.querySelector('[data-share]');
      this.status = this.querySelector('[data-share-status]');
      if (this.button) this.button.addEventListener('click', this.onClick);
    }

    onClick = async () => {
      const url = this.dataset.url || window.location.href;
      if (navigator.share) {
        try {
          await navigator.share({ title: this.dataset.title || document.title, url });
        } catch (error) {
          return;
        }
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        const message = this.dataset.copied || '';
        if (this.status) this.status.textContent = message;
        if (window.theme && window.theme.toast) window.theme.toast(message);
      } catch (error) {
        if (this.status) this.status.textContent = url;
      }
    };
  }
  if (!customElements.get('share-button')) customElements.define('share-button', ShareButton);

  class FbtBundle extends HTMLElement {
    connectedCallback() {
      this.addEventListener('change', this.update);
      this.addEventListener('click', this.onClick);
      if (this.querySelector('[data-fbt-content]')) {
        this.update();
      } else if (this.dataset.url) {
        this.load();
      }
    }

    disconnectedCallback() {
      this.removeEventListener('change', this.update);
      this.removeEventListener('click', this.onClick);
    }

    async load() {
      try {
        const response = await fetch(this.dataset.url);
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const match = doc.querySelector(`fbt-bundle[data-block-id="${this.dataset.blockId}"] [data-fbt-content]`);
        if (match && match.querySelectorAll('[data-fbt-check]').length > 1) {
          this.replaceChildren(match);
          this.update();
        } else {
          this.hidden = true;
        }
      } catch (error) {
        this.hidden = true;
      }
    }

    format(cents) {
      try {
        return new Intl.NumberFormat(document.documentElement.lang || undefined, {
          style: 'currency',
          currency: this.dataset.currency,
        }).format(cents / 100);
      } catch (error) {
        return (cents / 100).toFixed(2);
      }
    }

    selected() {
      return [...this.querySelectorAll('[data-fbt-check]')]
        .filter((check) => check.checked)
        .map((check) => {
          const select = check.closest('.fbt__item').querySelector('[data-fbt-variant]');
          const option = select ? select.selectedOptions[0] : null;
          return {
            id: option ? option.value : check.dataset.variantId,
            price: parseInt(option ? option.dataset.price : check.dataset.price, 10) || 0,
          };
        });
    }

    update = () => {
      const items = this.selected();
      const total = this.querySelector('[data-fbt-total]');
      const button = this.querySelector('[data-fbt-add]');
      if (total) total.textContent = this.format(items.reduce((sum, item) => sum + item.price, 0));
      if (button) button.disabled = items.length === 0;
    };

    onClick = async (event) => {
      const button = event.target.closest('[data-fbt-add]');
      if (!button || button.disabled) return;
      const error = this.querySelector('[data-fbt-error]');
      if (error) error.hidden = true;
      const formData = new FormData();
      this.selected().forEach((item, index) => {
        formData.append(`items[${index}][id]`, item.id);
        formData.append(`items[${index}][quantity]`, '1');
      });
      button.classList.add('is-loading');
      try {
        await window.theme.cart.add(formData);
        if (window.theme.settings && window.theme.settings.cartType === 'page') {
          window.location.href = window.theme.routes.cart;
          return;
        }
        window.theme.cart.open(button);
      } catch (err) {
        if (error) {
          error.textContent = err.message;
          error.hidden = false;
        }
      } finally {
        button.classList.remove('is-loading');
      }
    };
  }
  if (!customElements.get('fbt-bundle')) customElements.define('fbt-bundle', FbtBundle);
})();
