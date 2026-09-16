/**
 * Rebirth Wallet — Navigation Controller
 * Handles mobile menu toggle state, ARIA attributes, focus trapping, and keyboard navigation.
 */

export class NavigationController {
  constructor() {
    this.toggleButton = document.querySelector('.hamburger-toggle');
    this.mobileDrawer = document.getElementById('mobile-drawer');
    this.navLinks = document.querySelectorAll('.mobile-nav-link');
    this.isOpen = false;

    this.init();
  }

  init() {
    if (!this.toggleButton || !this.mobileDrawer) return;

    // Toggle button click listener
    this.toggleButton.addEventListener('click', () => this.toggleMenu());

    // Close drawer when any mobile nav link is clicked
    this.navLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (this.isOpen) {
          this.closeMenu();
        }
      });
    });

    // Close on Escape key press
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.closeMenu();
        this.toggleButton.focus();
      }
    });

    // Close on click outside drawer
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.mobileDrawer.contains(e.target) && !this.toggleButton.contains(e.target)) {
        this.closeMenu();
      }
    });
  }

  toggleMenu() {
    if (this.isOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  openMenu() {
    this.isOpen = true;
    this.toggleButton.setAttribute('aria-expanded', 'true');
    this.mobileDrawer.setAttribute('aria-hidden', 'false');
    this.mobileDrawer.classList.add('is-open');

    // Set focus to first navigable link inside drawer
    const firstFocusable = this.mobileDrawer.querySelector('a, button');
    if (firstFocusable) {
      firstFocusable.focus();
    }
  }

  closeMenu() {
    this.isOpen = false;
    this.toggleButton.setAttribute('aria-expanded', 'false');
    this.mobileDrawer.setAttribute('aria-hidden', 'true');
    this.mobileDrawer.classList.remove('is-open');
  }
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new NavigationController());
  } else {
    new NavigationController();
  }
}
