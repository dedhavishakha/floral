(() => {
  const utils = (window.theme && window.theme.utils) || {};
  const debounce =
    utils.debounce ||
    ((fn, wait) => {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
      };
    });
  const parseHTML = utils.parseHTML || ((html) => new DOMParser().parseFromString(html, 'text/html'));
  const COLUMNS_KEY = 'theme:grid-columns';

  const cleanUrl = (url) => {
    const u = new URL(url, window.location.origin);
    u.searchParams.delete('section_id');
    return u.pathname + u.search;
  };

  class FacetsSection extends HTMLElement {
    connectedCallback() {
      this.sectionId = this.dataset.sectionId;
      this.addEventListener('change', this.onChange);
      this.addEventListener('input', this.onInput);
      this.addEventListener('submit', this.onSubmit);
      this.addEventListener('click', this.onClick);
      window.addEventListener('popstate', this.onPopState);
      this.applyColumns(this.storedColumns());
      this.observeInfinite();
    }

    disconnectedCallback() {
      window.removeEventListener('popstate', this.onPopState);
      if (this.abort) this.abort.abort();
      if (this.infiniteObserver) this.infiniteObserver.disconnect();
    }

    observeInfinite() {
      if (this.infiniteObserver) this.infiniteObserver.disconnect();
      const button = this.querySelector('[data-load-more][data-infinite]');
      if (!button || !('IntersectionObserver' in window) || (window.Shopify && window.Shopify.designMode)) return;
      this.infiniteObserver = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting || button.classList.contains('is-loading')) return;
          this.infiniteObserver.disconnect();
          this.loadMore(button, { focus: false });
        },
        { rootMargin: '0px 0px 600px 0px' }
      );
      this.infiniteObserver.observe(button);
    }

    get form() {
      return this.querySelector('[data-facets-form]');
    }

    params() {
      const form = this.form;
      const data = form ? new FormData(form) : new FormData();
      const sort = this.querySelector('[data-facets-sort]');
      if (sort && (!form || sort.form !== form)) data.set('sort_by', sort.value);
      const params = new URLSearchParams();
      data.forEach((value, key) => {
        if (value !== '') params.append(key, value);
      });
      return params;
    }

    apply() {
      const query = this.params().toString();
      this.render(`${window.location.pathname}${query ? `?${query}` : ''}`);
    }

    applyDebounced = debounce(() => this.apply(), 700);

    onChange = (event) => {
      const target = event.target;
      if (target.matches('[data-price-input]')) return;
      const inForm = this.form && (this.form.contains(target) || target.form === this.form);
      if (inForm || target.matches('[data-facets-sort]')) this.apply();
    };

    onInput = (event) => {
      if (event.target.matches('[data-price-input]')) this.applyDebounced();
    };

    onSubmit = (event) => {
      if (!event.target.matches('[data-facets-form]')) return;
      event.preventDefault();
      this.apply();
      const dialog = this.querySelector('dialog[open]');
      if (dialog) dialog.close();
    };

    onClick = (event) => {
      const link = event.target.closest('a[data-facets-link]');
      if (link) {
        event.preventDefault();
        this.render(link.href);
        return;
      }
      const apply = event.target.closest('[data-facets-apply]');
      if (apply) {
        event.preventDefault();
        const dialog = apply.closest('dialog');
        if (dialog) dialog.close();
        return;
      }
      const more = event.target.closest('[data-load-more]');
      if (more) {
        event.preventDefault();
        this.loadMore(more);
        return;
      }
      const columns = event.target.closest('[data-columns]');
      if (columns) {
        const n = columns.dataset.columns === 'list' ? 'list' : parseInt(columns.dataset.columns, 10);
        try {
          sessionStorage.setItem(COLUMNS_KEY, String(n));
        } catch (e) {}
        this.applyColumns(n);
        return;
      }
      const showMore = event.target.closest('[data-show-more]');
      if (showMore) {
        const fieldset = showMore.closest('fieldset');
        const expanded = showMore.getAttribute('aria-expanded') === 'true';
        fieldset.classList.toggle('is-expanded', !expanded);
        showMore.setAttribute('aria-expanded', String(!expanded));
        showMore.textContent = expanded ? showMore.dataset.labelMore : showMore.dataset.labelLess;
      }
    };

    onPopState = () => {
      if (!this.isConnected) return;
      this.render(window.location.href, { push: false });
    };

    storedColumns() {
      try {
        const stored = sessionStorage.getItem(COLUMNS_KEY);
        return stored === 'list' ? 'list' : parseInt(stored, 10) || null;
      } catch (e) {
        return null;
      }
    }

    applyColumns(n) {
      if (!n) return;
      const grid = this.querySelector('[data-results-grid]');
      if (grid) {
        grid.classList.toggle('collection-grid--list', n === 'list');
        if (n !== 'list') grid.style.setProperty('--cols-desktop', n);
      }
      this.querySelectorAll('[data-columns]').forEach((button) => {
        const value = button.dataset.columns === 'list' ? 'list' : parseInt(button.dataset.columns, 10);
        button.setAttribute('aria-pressed', String(value === n));
      });
    }

    async fetchSection(url) {
      if (this.abort) this.abort.abort();
      this.abort = new AbortController();
      const fetchUrl = new URL(url, window.location.origin);
      fetchUrl.searchParams.set('section_id', this.sectionId);
      const response = await fetch(fetchUrl.toString(), { signal: this.abort.signal });
      if (!response.ok) throw new Error(String(response.status));
      return parseHTML(await response.text());
    }

    setBusy(busy) {
      const results = this.querySelector('[data-facets-update="results"]');
      if (results) results.toggleAttribute('aria-busy', busy);
      this.classList.toggle('is-loading', busy);
    }

    cleanLinks() {
      this.querySelectorAll('a[href*="section_id"]').forEach((link) => {
        link.setAttribute('href', cleanUrl(link.getAttribute('href')));
      });
    }

    async render(rawUrl, { push = true } = {}) {
      const url = cleanUrl(rawUrl);
      this.setBusy(true);
      try {
        const doc = await this.fetchSection(url);
        const next = doc.querySelector('facets-section');
        if (!next) throw new Error('missing section');

        const openState = new Map();
        this.querySelectorAll('details[id]').forEach((d) => openState.set(d.id, d.open));
        const expanded = new Set();
        this.querySelectorAll('fieldset.is-expanded [data-show-more]').forEach((b) => {
          const details = b.closest('details');
          if (details) expanded.add(details.id);
        });
        const focusedId = document.activeElement && this.contains(document.activeElement) ? document.activeElement.id : null;

        this.querySelectorAll('[data-facets-update]').forEach((el) => {
          if (!el.isConnected) return;
          const key = el.dataset.facetsUpdate;
          const replacement = next.querySelector(`[data-facets-update="${key}"]`);
          if (replacement) el.replaceWith(document.importNode(replacement, true));
        });

        openState.forEach((open, id) => {
          const details = document.getElementById(id);
          if (details && this.contains(details)) details.open = open;
        });
        expanded.forEach((id) => {
          const details = document.getElementById(id);
          const button = details && details.querySelector('[data-show-more]');
          if (button) button.click();
        });
        if (focusedId) {
          const el = document.getElementById(focusedId);
          if (el) el.focus({ preventScroll: true });
        }

        this.applyColumns(this.storedColumns());
        this.observeInfinite();
        this.cleanLinks();
        if (push) window.history.pushState({ facets: true }, '', url);
        this.announce(next);
        if (window.theme && typeof window.theme.initReveal === 'function') window.theme.initReveal();
        this.querySelectorAll('[data-results-grid] .reveal').forEach((el) => el.classList.add('is-revealed'));
      } catch (error) {
        if (error.name !== 'AbortError') window.location.href = url;
      } finally {
        this.setBusy(false);
      }
    }

    announce(source) {
      const status = this.querySelector('[data-facets-status]');
      const count = source.querySelector('[data-facets-update="count"]');
      if (status && count) status.textContent = count.textContent.trim();
    }

    async loadMore(button, { focus = true } = {}) {
      button.classList.add('is-loading');
      button.setAttribute('aria-disabled', 'true');
      try {
        const doc = await this.fetchSection(button.href);
        const grid = this.querySelector('[data-results-grid]');
        const nextGrid = doc.querySelector('[data-results-grid]');
        const items = nextGrid ? [...nextGrid.children] : [];
        const firstNew = items[0];
        items.forEach((item) => {
          item.classList.add('is-revealed');
          grid.appendChild(document.importNode(item, true));
        });
        const pagination = this.querySelector('[data-facets-update="pagination"]');
        const nextPagination = doc.querySelector('[data-facets-update="pagination"]');
        if (pagination && nextPagination) pagination.replaceWith(document.importNode(nextPagination, true));
        this.cleanLinks();
        if (firstNew && focus) {
          const appended = grid.children[grid.children.length - items.length];
          const link = appended && appended.querySelector('a[href]');
          if (link) link.focus({ preventScroll: true });
        }
        const status = this.querySelector('[data-facets-status]');
        const count = this.querySelector('.load-more__count');
        if (status && count) status.textContent = count.textContent.trim();
        this.observeInfinite();
      } catch (error) {
        if (error.name !== 'AbortError') window.location.href = button.href;
      } finally {
        button.classList.remove('is-loading');
        button.removeAttribute('aria-disabled');
      }
    }
  }

  if (!customElements.get('facets-section')) customElements.define('facets-section', FacetsSection);
})();
