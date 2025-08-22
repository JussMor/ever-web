interface ContactFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  countryCode?: string;
  message: string;
}

interface ContactResponse {
  success: boolean;
  message: string;
  id?: number;
  error?: string;
}

// Only run this code in the browser
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async (): Promise<void> => {
    const form = document.querySelector('.contact-form') as HTMLFormElement;
    if (!form) return;

    // Import blocked emails list (only on client side)
    const { blockedEmailsDomains } = await import('../constants/block-mails');
    
    // Function to check if email domain is blocked
    function isEmailBlocked(email: string): boolean {
      const domain = email.split('@')[1]?.toLowerCase();
      if (!domain) return false;
      return blockedEmailsDomains.includes(domain);
    }

    const requiredSelectors: string[] = ['#firstName', '#lastName', '#email', '#message'];
    const formErrors = document.querySelector('.form-errors') as HTMLElement;
    const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;

    function validate(): boolean {
      let firstInvalid: Element | null = null;
      
      requiredSelectors.forEach((sel: string): void => {
        const el = document.querySelector(sel);
        if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
      
        const fieldContainer = el.closest('.field') as HTMLElement;
        if (!el.checkValidity()) {
          if (fieldContainer) fieldContainer.classList.add('invalid');
          if (!firstInvalid) firstInvalid = el;
        } else {
          if (fieldContainer) fieldContainer.classList.remove('invalid');
        }
      });

      // Check for blocked email domains
      const emailInput = document.querySelector('#email') as HTMLInputElement;
      if (emailInput && emailInput.value) {
        if (isEmailBlocked(emailInput.value)) {
          const emailFieldContainer = emailInput.closest('.field') as HTMLElement;
          if (emailFieldContainer) emailFieldContainer.classList.add('invalid');
          if (!firstInvalid) firstInvalid = emailInput;
          if (formErrors) {
            formErrors.textContent = 'This email domain is not allowed. Please use a business email address.';
            formErrors.classList.add('show');
          }
          emailInput.focus();
          return false;
        }
      }

      if (firstInvalid) {
        if (formErrors) {
          formErrors.textContent = 'Please complete all required fields.';
          formErrors.classList.add('show');
        }
        (firstInvalid as HTMLInputElement | HTMLTextAreaElement).focus();
        return false;
      }
      
      if (formErrors) formErrors.classList.remove('show');
      return true;
    }

  function setLoading(loading: boolean): void {
    if (submitButton) {
      submitButton.disabled = loading;
      submitButton.textContent = loading ? 'Submitting...' : 'Request a Meeting';
    }
  }

  function showMessage(message: string, isError: boolean): void {
    if (formErrors) {
      formErrors.classList.remove('show');
      formErrors.textContent = message;
      formErrors.style.color = isError ? 'var(--error)' : 'var(--text)';
      formErrors.classList.add('show');
      
      if (!isError) {
        setTimeout((): void => {
          formErrors.classList.remove('show');
          formErrors.textContent = 'Please complete all required fields.';
          formErrors.style.color = '';
        }, 5000);
      }
    }
  }

  form.addEventListener('submit', async (e: Event): Promise<void> => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);

    // Collect form data
    const formData = new FormData(form);
    const countrySelect = form.querySelector('.country-select') as HTMLSelectElement;
    
    const data: ContactFormData = {
      firstName: formData.get('firstName') as string,
      lastName: formData.get('lastName') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string || undefined,
      countryCode: countrySelect ? countrySelect.value : '+1',
      message: formData.get('message') as string
    };

    try {
      // Submit to API
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });

      const result: ContactResponse = await response.json();
      
      setLoading(false);
      
      if (response.status === 201) {
        form.reset();
        document.querySelectorAll('.field.invalid').forEach((n: Element): void => { 
          n.classList.remove('invalid'); 
        });
        showMessage('Thanks! Your request has been sent successfully.', false);
        // open confirmation modal if available
        try {
          const fn = (window as any)['showSubmissionModal'];
          if (typeof fn === 'function') fn();
        } catch (err) {
          // ignore if not available
        }
      } else {
        showMessage(result.error || 'Something went wrong. Please try again.', true);
      }
    } catch (error) {
      setLoading(false);
      console.error('Error:', error);
      showMessage('Network error. Please check your connection and try again.', true);
    }
  });

  // Live validation removal
  requiredSelectors.forEach((sel: string): void => {
    const el = document.querySelector(sel);
    if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    
    el.addEventListener('input', (): void => {
      const fieldContainer = el.closest('.field') as HTMLElement;
      if (el.checkValidity()) {
        if (fieldContainer) fieldContainer.classList.remove('invalid');
      }
    });
  });

  // Country select search/filtering
  // New custom dropdown implementation
  const dropdown = document.querySelector('.country-dropdown') as HTMLElement | null;
  if (dropdown) {
    const toggle = dropdown.querySelector('.country-toggle') as HTMLButtonElement | null;
    const wrapper = dropdown.closest('.country-select-wrapper') as HTMLElement | null;
    const panel = wrapper?.querySelector('.country-panel') as HTMLElement | null;
    const panelSearch = panel?.querySelector('.country-panel-search') as HTMLInputElement | null;
    const list = panel?.querySelector('.country-list') as HTMLUListElement | null;
    const current = dropdown.querySelector('.country-current') as HTMLElement | null;
    const hidden = dropdown.querySelector('.country-code-input') as HTMLInputElement | null;

  if (!toggle || !panel || !panelSearch || !list || !current || !hidden) return;

  const dd = dropdown as HTMLElement;
  const tg = toggle as HTMLButtonElement;
  const pnl = panel as HTMLElement;
  const psearch = panelSearch as HTMLInputElement;
  const lst = list as HTMLUListElement;
  const cur = current as HTMLElement;
  const hid = hidden as HTMLInputElement;

    function openPanel() {
      dd.setAttribute('data-open', 'true');
      tg.setAttribute('aria-expanded', 'true');
      pnl.hidden = false;
      psearch.focus();
    }

    function closePanel() {
      dd.setAttribute('data-open', 'false');
      tg.setAttribute('aria-expanded', 'false');
      pnl.hidden = true;
      // Do not force focus back to toggle; allow user to focus other inputs
    }

    tg.addEventListener('click', (e) => {
      const open = dd.getAttribute('data-open') === 'true';
      if (open) closePanel(); else openPanel();
    });

    // Click outside closes only if open; do not steal focus
    document.addEventListener('click', (e) => {
      const open = dd.getAttribute('data-open') === 'true';
      if (open && !wrapper?.contains(e.target as Node)) closePanel();
    });

    // Filter list
    const items = Array.from(lst.querySelectorAll('li')) as HTMLLIElement[];
    const normalized = items.map((li) => ({
      el: li as HTMLLIElement,
      text: li.textContent ? li.textContent.toLowerCase() : '',
      name: (li.getAttribute('data-name') || '').toLowerCase(),
      iso: (li.getAttribute('data-iso') || '').toLowerCase(),
      value: li.getAttribute('data-value') || ''
    }));

  function renderFilter(q: string) {
      const s = q.trim().toLowerCase();
      normalized.forEach((n) => {
        const show = !s || n.text.includes(s) || n.name.includes(s) || n.iso.includes(s) || n.value.includes(s);
        n.el.style.display = show ? '' : 'none';
      });
    }

    psearch.addEventListener('input', (): void => {
      renderFilter(psearch.value);
    });

    // Selection
    items.forEach((li) => {
      li.addEventListener('click', () => {
        const v = li.getAttribute('data-value') || '';
        const txt = li.textContent || '';
        hid.value = v;
        // Show only flag and dial code, not full country name
        const parts = txt.trim().split(' ');
        const flag = parts[0] || '';
        const code = parts[1] || '';
        cur.textContent = `${flag} ${code}`;
        closePanel();
      });
    });

    // Keyboard navigation inside panel
    lst.addEventListener('keydown', (ev: KeyboardEvent) => {
      const visible = Array.from(lst.querySelectorAll('li')).filter((n) => (n as HTMLElement).style.display !== 'none') as HTMLLIElement[];
      const active = document.activeElement;
      const idx = active ? visible.indexOf(active as HTMLLIElement) : -1;
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        const next = (visible[idx + 1] as HTMLElement) || (visible[0] as HTMLElement);
        next?.focus();
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        const prev = (visible[idx - 1] as HTMLElement) || (visible[visible.length - 1] as HTMLElement);
        prev?.focus();
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        (document.activeElement as HTMLElement)?.click();
      } else if (ev.key === 'Escape') {
        closePanel();
      }
    });

    // make list items focusable when navigating
    items.forEach((li) => {
      li.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') (ev.currentTarget as HTMLElement).click();
      });
    });
  }
  });
}
