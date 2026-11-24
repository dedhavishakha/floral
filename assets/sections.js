(() => {
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const toast = (message) => {
    if (window.theme && typeof window.theme.toast === 'function') window.theme.toast(message);
  };

  const setToggleState = (button, paused) => {
    if (!button) return;
    button.setAttribute('aria-pressed', paused ? 'true' : 'false');
    button.setAttribute('aria-label', paused ? button.dataset.labelPlay : button.dataset.labelPause);
  };

  class SlideShow extends HTMLElement {
    connectedCallback() {
      this.slides = [...this.querySelectorAll('[data-slide]')];
      if (this.slides.length < 2) return;
      this.track = this.querySelector('[data-slideshow-track]');
      this.dots = [...this.querySelectorAll('[data-slide-to]')];
      this.toggle = this.querySelector('[data-slideshow-toggle]');
      this.index = Math.max(0, this.slides.findIndex((slide) => slide.classList.contains('is-active')));
      this.interval = (parseInt(this.dataset.interval, 10) || 6) * 1000;
      this.autoplay = this.dataset.autoplay === 'true';
      this.userPaused = reducedMotion();
      this.hovering = false;

      const prev = this.querySelector('[data-slideshow-prev]');
      const next = this.querySelector('[data-slideshow-next]');
      if (prev) prev.addEventListener('click', () => this.goTo(this.index - 1));
      if (next) next.addEventListener('click', () => this.goTo(this.index + 1));
      this.dots.forEach((dot) => dot.addEventListener('click', () => this.goTo(parseInt(dot.dataset.slideTo, 10))));

      if (this.toggle) {
        setToggleState(this.toggle, this.userPaused);
        this.classList.toggle('is-paused', this.userPaused);
        this.toggle.addEventListener('click', () => {
          this.userPaused = !this.userPaused;
          setToggleState(this.toggle, this.userPaused);
          this.classList.toggle('is-paused', this.userPaused);
          this.start();
        });
      }

      this.addEventListener('pointerenter', () => (this.hovering = true));
      this.addEventListener('pointerleave', () => (this.hovering = false));
      this.addEventListener('focusin', () => (this.hovering = true));
      this.addEventListener('focusout', (event) => {
        if (!this.contains(event.relatedTarget)) this.hovering = false;
      });
      this.addEventListener('keydown', (event) => {
        if (event.target.closest('input, textarea, select')) return;
        if (event.key === 'ArrowLeft') this.goTo(this.index - 1);
        if (event.key === 'ArrowRight') this.goTo(this.index + 1);
      });

      let startX = null;
      this.track.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse') return;
        startX = event.clientX;
      });
      this.track.addEventListener('pointerup', (event) => {
        if (startX === null) return;
        const dx = event.clientX - startX;
        startX = null;
        if (Math.abs(dx) > 40) this.goTo(this.index + (dx < 0 ? 1 : -1) * (document.documentElement.dir === 'rtl' ? -1 : 1));
      });
      this.track.addEventListener('pointercancel', () => (startX = null));

      this.addEventListener('shopify:block:select', (event) => {
        const i = this.slides.indexOf(event.target);
        if (i < 0) return;
        this.blockSelected = true;
        this.goTo(i);
        this.stop();
      });
      this.addEventListener('shopify:block:deselect', () => {
        this.blockSelected = false;
        this.start();
      });

      this.start();
    }

    disconnectedCallback() {
      this.stop();
    }

    goTo(i) {
      const count = this.slides.length;
      this.index = (i + count) % count;
      this.slides.forEach((slide, k) => {
        const active = k === this.index;
        slide.classList.toggle('is-active', active);
        slide.inert = !active;
      });
      this.dots.forEach((dot, k) => {
        if (k === this.index) {
          dot.setAttribute('aria-current', 'true');
        } else {
          dot.removeAttribute('aria-current');
        }
      });
    }

    stop() {
      clearInterval(this.timer);
    }

    start() {
      this.stop();
      if (!this.autoplay || this.userPaused || this.blockSelected) return;
      this.timer = setInterval(() => {
        if (!this.hovering && !document.hidden) this.goTo(this.index + 1);
      }, this.interval);
    }
  }
  if (!customElements.get('slide-show')) customElements.define('slide-show', SlideShow);

  class HeroVideoToggle extends HTMLElement {
    connectedCallback() {
      this.button = this.querySelector('button');
      const stage = this.closest('.hero__stage');
      this.video = stage && stage.querySelector('video');
      if (!this.video || !this.button) {
        this.hidden = true;
        return;
      }
      if (reducedMotion()) {
        this.video.removeAttribute('autoplay');
        this.video.pause();
      }
      this.sync();
      this.video.addEventListener('play', () => this.sync());
      this.video.addEventListener('pause', () => this.sync());
      this.button.addEventListener('click', () => {
        if (this.video.paused) {
          this.video.play();
        } else {
          this.video.pause();
        }
      });
    }

    sync() {
      setToggleState(this.button, this.video.paused);
      this.classList.toggle('is-paused', this.video.paused);
    }
  }
  if (!customElements.get('hero-video-toggle')) customElements.define('hero-video-toggle', HeroVideoToggle);

  class CollectionTabs extends HTMLElement {
    connectedCallback() {
      this.tabs = [...this.querySelectorAll('[data-tab]')];
      this.panels = [...this.querySelectorAll('[data-tab-panel]')];
      if (!this.tabs.length) return;
      this.tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => this.select(i));
        tab.addEventListener('keydown', (event) => this.onKeydown(event, i));
      });
      this.addEventListener('shopify:block:select', (event) => {
        const i = this.tabs.indexOf(event.target);
        if (i > -1) this.select(i);
      });
      this.headerNav = this.querySelector('[data-tabs-nav]');
      if (this.headerNav) {
        this.headerPrev = this.headerNav.querySelector('[data-tabs-prev]');
        this.headerNext = this.headerNav.querySelector('[data-tabs-next]');
        this.headerPrev.addEventListener('click', () => this.scrollActive(-1));
        this.headerNext.addEventListener('click', () => this.scrollActive(1));
        // Mirror the open tab's own arrows: disabled at the ends, hidden when nothing overflows.
        const observer = new MutationObserver(() => this.syncNav());
        this.panels.forEach((panel) => {
          panel.querySelectorAll('[data-carousel-prev], [data-carousel-next], .carousel__nav').forEach((el) => {
            observer.observe(el, { attributes: true, attributeFilter: ['disabled', 'data-overflow'] });
          });
        });
        this.syncNav();
      }
    }

    activeCarousel() {
      const panel = this.panels.find((p) => !p.hidden);
      return panel ? panel.querySelector('carousel-slider') : null;
    }

    scrollActive(direction) {
      const carousel = this.activeCarousel();
      if (carousel && typeof carousel.go === 'function') carousel.go(direction);
    }

    syncNav() {
      const carousel = this.activeCarousel();
      if (!this.headerNav || !carousel) return;
      const prev = carousel.querySelector('[data-carousel-prev]');
      const next = carousel.querySelector('[data-carousel-next]');
      const nav = carousel.querySelector('.carousel__nav');
      this.headerPrev.disabled = prev ? prev.disabled : true;
      this.headerNext.disabled = next ? next.disabled : true;
      this.headerNav.dataset.overflow = nav && nav.dataset.overflow ? nav.dataset.overflow : 'true';
    }

    select(i, focus = false) {
      this.tabs.forEach((tab, k) => {
        const active = k === i;
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.tabIndex = active ? 0 : -1;
      });
      this.panels.forEach((panel, k) => {
        panel.hidden = k !== i;
      });
      this.syncNav();
      if (focus) this.tabs[i].focus();
    }

    onKeydown(event, i) {
      const last = this.tabs.length - 1;
      let next = null;
      if (event.key === 'ArrowRight') next = i === last ? 0 : i + 1;
      if (event.key === 'ArrowLeft') next = i === 0 ? last : i - 1;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = last;
      if (next === null) return;
      event.preventDefault();
      this.select(next, true);
    }
  }
  if (!customElements.get('collection-tabs')) customElements.define('collection-tabs', CollectionTabs);

  class BeforeAfter extends HTMLElement {
    connectedCallback() {
      this.media = this.querySelector('.before-after__media');
      this.range = this.querySelector('.before-after__range');
      if (!this.media || !this.range) return;
      this.range.addEventListener('input', () => this.set(this.range.value));
      this.media.addEventListener('pointerdown', this.onDown);
      this.set(this.range.value);
    }

    set(value) {
      const position = Math.min(100, Math.max(0, Number(value)));
      this.style.setProperty('--position', `${position}%`);
      this.range.value = String(Math.round(position));
      this.range.setAttribute('aria-valuetext', `${Math.round(position)}%`);
    }

    fromPointer(event) {
      const rect = this.media.getBoundingClientRect();
      let position = ((event.clientX - rect.left) / rect.width) * 100;
      if (getComputedStyle(this).direction === 'rtl') position = 100 - position;
      this.set(position);
    }

    onDown = (event) => {
      if (event.button !== 0) return;
      this.media.setPointerCapture(event.pointerId);
      this.fromPointer(event);
      this.media.addEventListener('pointermove', this.onMove);
      const stop = () => this.media.removeEventListener('pointermove', this.onMove);
      this.media.addEventListener('pointerup', stop, { once: true });
      this.media.addEventListener('pointercancel', stop, { once: true });
    };

    onMove = (event) => this.fromPointer(event);
  }
  if (!customElements.get('before-after')) customElements.define('before-after', BeforeAfter);

  class ShopTheLook extends HTMLElement {
    connectedCallback() {
      this.hotspots = [...this.querySelectorAll('[data-hotspot]')];
      this.popovers = [...this.querySelectorAll('[data-hotspot-popover]')];
      this.items = [...this.querySelectorAll('[data-hotspot-item]')];
      this.hotspots.forEach((hotspot, i) => {
        hotspot.addEventListener('click', (event) => {
          event.stopPropagation();
          this.isOpen(i) ? this.close() : this.open(i);
        });
      });
      this.items.forEach((item) => {
        const i = parseInt(item.dataset.hotspotItem, 10);
        item.addEventListener('pointerenter', () => this.highlight(i));
        item.addEventListener('pointerleave', () => this.highlight(-1));
        item.addEventListener('focusin', () => this.highlight(i));
        item.addEventListener('focusout', () => this.highlight(-1));
      });
      this.onDocumentClick = (event) => {
        if (!event.target.closest('[data-hotspot-popover], [data-hotspot]')) this.close();
      };
      this.onKeydown = (event) => {
        if (event.key !== 'Escape' || this.current === undefined || this.current < 0) return;
        const hotspot = this.hotspots[this.current];
        this.close();
        if (hotspot) hotspot.focus();
      };
      document.addEventListener('click', this.onDocumentClick);
      document.addEventListener('keydown', this.onKeydown);
      this.addEventListener('shopify:block:select', (event) => {
        const i = this.hotspots.indexOf(event.target);
        if (i > -1) this.open(i);
      });

      this.addAll = this.querySelector('[data-add-all]');
      if (this.addAll) this.addAll.addEventListener('click', () => this.addAllToCart());
    }

    disconnectedCallback() {
      document.removeEventListener('click', this.onDocumentClick);
      document.removeEventListener('keydown', this.onKeydown);
    }

    isOpen(i) {
      return this.current === i;
    }

    open(i) {
      this.current = i;
      this.hotspots.forEach((hotspot, k) => hotspot.setAttribute('aria-expanded', k === i ? 'true' : 'false'));
      this.popovers.forEach((popover, k) => {
        popover.hidden = k !== i;
      });
      this.highlight(i);
    }

    close() {
      this.current = -1;
      this.hotspots.forEach((hotspot) => hotspot.setAttribute('aria-expanded', 'false'));
      this.popovers.forEach((popover) => (popover.hidden = true));
      this.highlight(-1);
    }

    highlight(i) {
      const active = i > -1 ? i : this.current;
      this.hotspots.forEach((hotspot, k) => hotspot.classList.toggle('is-highlighted', k === active));
      this.items.forEach((item) => item.classList.toggle('is-highlighted', parseInt(item.dataset.hotspotItem, 10) === active));
    }

    async addAllToCart() {
      const button = this.addAll;
      const error = this.querySelector('[data-add-all-error]');
      const ids = (button.dataset.variantIds || '').split(',').filter(Boolean);
      if (!ids.length || !window.theme || !window.theme.cart) return;
      if (error) error.hidden = true;
      button.classList.add('is-loading');
      button.setAttribute('aria-disabled', 'true');
      const formData = new FormData();
      ids.forEach((id, i) => {
        formData.append(`items[${i}][id]`, id);
        formData.append(`items[${i}][quantity]`, '1');
      });
      try {
        await window.theme.cart.add(formData);
        if (window.theme.settings && window.theme.settings.cartType === 'page') {
          window.location.href = window.theme.routes.cart;
          return;
        }
        toast(window.theme.strings && window.theme.strings.addedToCart);
        window.theme.cart.open(button);
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
    }
  }
  if (!customElements.get('shop-the-look')) customElements.define('shop-the-look', ShopTheLook);

  class MarqueeText extends HTMLElement {
    connectedCallback() {
      this.toggle = this.querySelector('[data-marquee-toggle]');
      this.userPaused = false;
      if (this.toggle) {
        if (reducedMotion()) {
          this.toggle.hidden = true;
        }
        this.toggle.addEventListener('click', () => {
          this.userPaused = !this.userPaused;
          this.classList.toggle('is-paused', this.userPaused);
          setToggleState(this.toggle, this.userPaused);
        });
      }
      this.addEventListener('shopify:block:select', () => this.classList.add('is-paused'));
      this.addEventListener('shopify:block:deselect', () => this.classList.toggle('is-paused', this.userPaused));
      if ('IntersectionObserver' in window) {
        this.observer = new IntersectionObserver(([entry]) => {
          this.classList.toggle('is-offscreen', !entry.isIntersecting);
        });
        this.observer.observe(this);
      }
    }

    disconnectedCallback() {
      if (this.observer) this.observer.disconnect();
    }
  }
  if (!customElements.get('marquee-text')) customElements.define('marquee-text', MarqueeText);

  class CopyCode extends HTMLElement {
    connectedCallback() {
      const button = this.querySelector('[data-copy-button]');
      if (!button) return;
      button.addEventListener('click', async () => {
        const code = this.dataset.code || '';
        try {
          await navigator.clipboard.writeText(code);
        } catch (error) {
          const value = this.querySelector('code');
          if (value) {
            const range = document.createRange();
            range.selectNodeContents(value);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
        this.classList.add('is-copied');
        toast(this.dataset.copied);
        setTimeout(() => this.classList.remove('is-copied'), 2000);
      });
    }
  }
  if (!customElements.get('copy-code')) customElements.define('copy-code', CopyCode);

  class NewsletterPopup extends HTMLElement {
    static KEY = 'theme:newsletter-popup';

    connectedCallback() {
      this.dialog = this.querySelector('dialog');
      if (!this.dialog) return;
      this.dialog.addEventListener('close', this.onClose);

      if (window.Shopify && window.Shopify.designMode) {
        document.addEventListener('shopify:section:select', this.onSectionSelect);
        document.addEventListener('shopify:section:load', this.onSectionSelect);
        document.addEventListener('shopify:section:deselect', this.onSectionDeselect);
        return;
      }

      const posted = new URLSearchParams(window.location.search).get('customer_posted') === 'true';
      if (posted) this.save({ subscribed: true });
      if (window.location.hash === `#${this.dataset.formId}`) {
        this.open();
        return;
      }
      if (this.dataset.enabled !== 'true' || !this.shouldShow()) return;

      const delay = Math.max(2, parseInt(this.dataset.delay, 10) || 8) * 1000;
      this.timer = setTimeout(() => this.open(), delay);
      if (this.dataset.exitIntent === 'true' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        document.documentElement.addEventListener('mouseleave', this.onExit);
      }
    }

    disconnectedCallback() {
      clearTimeout(this.timer);
      document.documentElement.removeEventListener('mouseleave', this.onExit);
      document.removeEventListener('shopify:section:select', this.onSectionSelect);
      document.removeEventListener('shopify:section:load', this.onSectionSelect);
      document.removeEventListener('shopify:section:deselect', this.onSectionDeselect);
    }

    read() {
      try {
        return JSON.parse(localStorage.getItem(NewsletterPopup.KEY) || '{}') || {};
      } catch (error) {
        return {};
      }
    }

    save(patch) {
      try {
        localStorage.setItem(NewsletterPopup.KEY, JSON.stringify({ ...this.read(), ...patch }));
      } catch (error) {
        return;
      }
    }

    shouldShow() {
      const state = this.read();
      if (state.subscribed) return false;
      if (this.dataset.mobile !== 'true' && window.matchMedia('(max-width: 749px)').matches) return false;
      const days = parseInt(this.dataset.frequency, 10) || 14;
      if (state.dismissedAt && Date.now() - state.dismissedAt < days * 86400000) return false;
      return true;
    }

    open() {
      clearTimeout(this.timer);
      document.documentElement.removeEventListener('mouseleave', this.onExit);
      if (this.dialog.open) return;
      const other = document.querySelector('dialog[open]');
      if (other && !(window.Shopify && window.Shopify.designMode)) {
        // Another window (cart, search, menu) is open: try again a moment after it closes.
        other.addEventListener('close', () => setTimeout(() => this.open(), 1500), { once: true });
        return;
      }
      if (window.theme && window.theme.openDialog) window.theme.openDialog(this.dialog);
      else this.dialog.showModal();
      const success = this.dialog.querySelector('[data-popup-success]');
      if (success) success.focus();
    }

    onExit = (event) => {
      if (event.clientY > 0) return;
      this.open();
    };

    onClose = () => {
      if (window.Shopify && window.Shopify.designMode) return;
      if (!this.read().subscribed) this.save({ dismissedAt: Date.now() });
    };

    onSectionSelect = (event) => {
      if (event.target.contains(this)) this.open();
    };

    onSectionDeselect = (event) => {
      if (event.target.contains(this) && this.dialog.open) this.dialog.close();
    };
  }
  if (!customElements.get('newsletter-popup')) customElements.define('newsletter-popup', NewsletterPopup);

  class LazyVideo extends HTMLElement {
    connectedCallback() {
      this.button = this.querySelector('[data-video-play]');
      this.template = this.querySelector('[data-video-template]');
      if (!this.button || !this.template) return;
      this.button.addEventListener('click', () => this.load());
    }

    load() {
      const content = this.template.content.cloneNode(true);
      const media = content.querySelector('iframe, video');
      this.classList.add('is-loaded');
      this.button.remove();
      this.appendChild(content);
      if (media) {
        media.setAttribute('tabindex', '-1');
        media.focus({ preventScroll: true });
        if (media.tagName === 'VIDEO') media.play().catch(() => {});
      }
    }
  }
  if (!customElements.get('lazy-video')) customElements.define('lazy-video', LazyVideo);

  class ShoppableVideos extends HTMLElement {
    connectedCallback() {
      this.items = [...this.querySelectorAll('[data-video-item]')];
      this.autoplay = this.dataset.autoplay === 'true' && !reducedMotion();
      this.modal = document.getElementById(this.dataset.modal);
      this.addEventListener('click', this.onClick);
      if (this.autoplay && 'IntersectionObserver' in window) {
        this.observer = new IntersectionObserver(this.onIntersect, { threshold: 0.6 });
        this.items.forEach((item) => {
          const video = item.querySelector('video');
          if (video) this.observer.observe(video);
        });
      }
      if (this.modal) {
        this.modal.addEventListener('close', () => {
          const body = this.modal.querySelector('[data-video-modal-content]');
          if (body) body.replaceChildren();
        });
      }
      this.addEventListener('shopify:block:select', (event) => {
        const video = event.target.querySelector('video');
        event.target.scrollIntoView({ block: 'nearest', inline: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
        if (video) this.play(video);
      });
    }

    disconnectedCallback() {
      if (this.observer) this.observer.disconnect();
      this.removeEventListener('click', this.onClick);
    }

    play(video) {
      video.muted = true;
      const attempt = video.play();
      if (attempt && attempt.catch) attempt.catch(() => {});
      this.sync(video);
    }

    pause(video) {
      video.pause();
      this.sync(video);
    }

    sync(video) {
      const item = video.closest('[data-video-item]');
      const toggle = item && item.querySelector('[data-video-toggle]');
      if (!toggle) return;
      const playing = !video.paused;
      item.classList.toggle('is-playing', playing);
      toggle.setAttribute('aria-pressed', playing ? 'true' : 'false');
      toggle.setAttribute('aria-label', playing ? toggle.dataset.labelPause : toggle.dataset.labelPlay);
    }

    onIntersect = (entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (video.dataset.userPaused === 'true') return;
        if (entry.isIntersecting) this.play(video);
        else this.pause(video);
      });
    };

    onClick = (event) => {
      const toggle = event.target.closest('[data-video-toggle]');
      if (toggle) {
        const video = toggle.closest('[data-video-item]').querySelector('video');
        if (!video) return;
        if (video.paused) {
          video.dataset.userPaused = 'false';
          this.play(video);
        } else {
          video.dataset.userPaused = 'true';
          this.pause(video);
        }
        return;
      }
      const open = event.target.closest('[data-video-open]');
      if (open && this.modal) this.openModal(open.closest('[data-video-item]'), open);
    };

    openModal(item, opener) {
      const source = item.querySelector('video');
      const body = this.modal.querySelector('[data-video-modal-content]');
      if (!source || !body) return;
      this.items.forEach((other) => {
        const v = other.querySelector('video');
        if (v) {
          v.dataset.userPaused = 'true';
          this.pause(v);
        }
      });
      const video = document.createElement('video');
      video.src = source.currentSrc || (source.querySelector('source') || {}).src || '';
      if (source.poster) video.poster = source.poster;
      video.controls = true;
      video.playsInline = true;
      video.loop = true;
      video.className = 'shoppable-videos__modal-video';
      const product = item.querySelector('[data-video-product]');
      body.replaceChildren(video);
      if (product) body.appendChild(product.cloneNode(true));
      if (window.theme && typeof window.theme.openDialog === 'function') window.theme.openDialog(this.modal, opener);
      else this.modal.showModal();
      const attempt = video.play();
      if (attempt && attempt.catch) attempt.catch(() => {});
    }
  }
  if (!customElements.get('shoppable-videos')) customElements.define('shoppable-videos', ShoppableVideos);

  const focusNewsletterMessage = () => {
    const message = document.querySelector('[data-newsletter-success], .newsletter .form-message--error');
    if (!message) return;
    message.setAttribute('tabindex', '-1');
    message.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    message.focus({ preventScroll: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', focusNewsletterMessage);
  } else {
    focusNewsletterMessage();
  }
})();
