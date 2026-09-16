import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock DOM element implementation for unit testing NavigationController
class MockClassList {
  constructor() {
    this._classes = new Set();
  }
  add(cls) { this._classes.add(cls); }
  remove(cls) { this._classes.delete(cls); }
  contains(cls) { return this._classes.has(cls); }
}

class MockElement {
  constructor(tagName = 'div', attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.classList = new MockClassList();
    this.listeners = {};
    this.focused = false;
    this.children = [];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  contains(target) {
    return target === this || this.children.includes(target);
  }

  addEventListener(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  dispatchEvent(event) {
    if (this.listeners[event.type]) {
      this.listeners[event.type].forEach(fn => fn(event));
    }
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this });
  }

  focus() {
    this.focused = true;
  }

  querySelector(selector) {
    return this.children[0] || null;
  }

  querySelectorAll(selector) {
    return this.children;
  }
}

describe('NavigationController Unit Tests', () => {

  it('should toggle aria-expanded attribute on hamburger button click', async () => {
    // Setup mock elements
    const button = new MockElement('button', { 'aria-expanded': 'false' });
    const drawer = new MockElement('div', { 'id': 'mobile-drawer', 'aria-hidden': 'true' });
    const link = new MockElement('a');
    drawer.children.push(link);

    // Mock document
    const documentListeners = {};
    global.document = {
      querySelector: (selector) => selector === '.hamburger-toggle' ? button : null,
      getElementById: (id) => id === 'mobile-drawer' ? drawer : null,
      querySelectorAll: () => [link],
      addEventListener: (evt, fn) => {
        if (!documentListeners[evt]) documentListeners[evt] = [];
        documentListeners[evt].push(fn);
      },
      readyState: 'complete'
    };

    // Import controller dynamically
    const { NavigationController } = await import('../src/js/navigation.js');
    const nav = new NavigationController();

    // Initial state
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(drawer.getAttribute('aria-hidden'), 'true');
    assert.equal(nav.isOpen, false);

    // Open menu
    nav.openMenu();
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.equal(drawer.getAttribute('aria-hidden'), 'false');
    assert.equal(nav.isOpen, true);
    assert.equal(drawer.classList.contains('is-open'), true);
    assert.equal(link.focused, true);

    // Close menu
    nav.closeMenu();
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(drawer.getAttribute('aria-hidden'), 'true');
    assert.equal(nav.isOpen, false);
    assert.equal(drawer.classList.contains('is-open'), false);
  });

  it('should close menu on Escape key press', async () => {
    const button = new MockElement('button', { 'aria-expanded': 'false' });
    const drawer = new MockElement('div', { 'id': 'mobile-drawer', 'aria-hidden': 'true' });

    const documentListeners = {};
    global.document = {
      querySelector: (selector) => selector === '.hamburger-toggle' ? button : null,
      getElementById: (id) => id === 'mobile-drawer' ? drawer : null,
      querySelectorAll: () => [],
      addEventListener: (evt, fn) => {
        if (!documentListeners[evt]) documentListeners[evt] = [];
        documentListeners[evt].push(fn);
      },
      readyState: 'complete'
    };

    const { NavigationController } = await import('../src/js/navigation.js');
    const nav = new NavigationController();

    nav.openMenu();
    assert.equal(nav.isOpen, true);

    // Simulate Escape keydown event
    const escapeEvent = { key: 'Escape' };
    documentListeners['keydown'].forEach(fn => fn(escapeEvent));

    assert.equal(nav.isOpen, false);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(button.focused, true);
  });

});
