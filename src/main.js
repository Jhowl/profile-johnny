// Footer year
document.getElementById('current-year').textContent = new Date().getFullYear();

// Fade-in sections/cards as they enter the viewport
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1 }
);

document.querySelectorAll('.animate-on-scroll').forEach((el) => observer.observe(el));

// Contact form submission
const form = document.getElementById('contact-form');
if (form) {
  const status = document.getElementById('form-status');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const endpoint = form.dataset.endpoint;
    if (!endpoint) {
      // Backend not wired up yet — fall back to a mailto so the form still works.
      const data = new FormData(form);
      const subject = encodeURIComponent(`Website inquiry from ${data.get('name')}`);
      const body = encodeURIComponent(`${data.get('message')}\n\nFrom: ${data.get('name')} <${data.get('email')}>`);
      window.location.href = `mailto:contact@johnnycosta.dev?subject=${subject}&body=${body}`;
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.className = 'form-status';
    status.textContent = 'Sending…';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });

      if (!res.ok) throw new Error(`Request failed: ${res.status}`);

      status.className = 'form-status success';
      status.textContent = "Thanks! Your message has been sent. I'll get back to you soon.";
      form.reset();
    } catch (err) {
      status.className = 'form-status error';
      status.textContent = 'Something went wrong. Please email contact@johnnycosta.dev directly.';
    } finally {
      button.disabled = false;
    }
  });
}
