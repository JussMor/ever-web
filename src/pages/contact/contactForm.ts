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
  document.addEventListener('DOMContentLoaded', (): void => {
    const form = document.querySelector('.contact-form') as HTMLFormElement;
    if (!form) return;

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

    if (firstInvalid) {
      if (formErrors) formErrors.classList.add('show');
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
  });
}
