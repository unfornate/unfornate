document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const header = document.querySelector('header');
  const menuToggle = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('nav');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let navOverlay = null;

  const closeNavigation = () => {
    body.classList.remove('nav-open');
    if (menuToggle) {
      menuToggle.setAttribute('aria-expanded', 'false');
    }
  };

  if (menuToggle && navigation) {
    menuToggle.setAttribute('aria-expanded', 'false');

    navOverlay = document.createElement('div');
    navOverlay.className = 'nav-overlay';
    document.body.appendChild(navOverlay);

    menuToggle.addEventListener('click', () => {
      const isOpen = !body.classList.contains('nav-open');
      body.classList.toggle('nav-open', isOpen);
      menuToggle.setAttribute('aria-expanded', String(isOpen));
    });

    navOverlay.addEventListener('click', closeNavigation);

    navigation.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeNavigation);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeNavigation();
      }
    });
  }

  const updateHeaderState = () => {
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 12);
  };

  updateHeaderState();
  window.addEventListener('scroll', updateHeaderState, { passive: true });

  const quiz = document.querySelector('[data-quiz]');
  if (quiz) {
    const steps = Array.from(quiz.querySelectorAll('.quiz-step'));
    const progressBar = quiz.querySelector('.quiz-progress div');
    const nextButtons = quiz.querySelectorAll('[data-quiz-next]');
    const prevButtons = quiz.querySelectorAll('[data-quiz-prev]');
    const submitButton = quiz.querySelector('[data-quiz-submit]');
    let currentStep = 0;

    const update = () => {
      steps.forEach((step, index) => {
        step.classList.toggle('active', index === currentStep);
      });

      if (progressBar) {
        const progress = ((currentStep + 1) / steps.length) * 100;
        progressBar.style.width = `${progress}%`;
      }
    };

    const validateStep = (step) => {
      const requiredFields = Array.from(step.querySelectorAll('[data-required]'));
      let isValid = true;

      requiredFields.forEach((field) => {
        if (field.type === 'checkbox' || field.type === 'radio') {
          const name = field.name;
          const checked = step.querySelectorAll(`[name="${name}"]:checked`).length > 0;
          if (!checked) {
            isValid = false;
            field.classList.add('error');
          } else {
            field.classList.remove('error');
          }
        } else if (!field.value.trim()) {
          isValid = false;
          field.classList.add('error');
        } else {
          field.classList.remove('error');
        }
      });

      return isValid;
    };

    nextButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const step = steps[currentStep];
        if (validateStep(step)) {
          currentStep = Math.min(currentStep + 1, steps.length - 1);
          update();
        }
      });
    });

    prevButtons.forEach((button) => {
      button.addEventListener('click', () => {
        currentStep = Math.max(currentStep - 1, 0);
        update();
      });
    });

    if (submitButton) {
      submitButton.addEventListener('click', (event) => {
        const step = steps[currentStep];
        if (!validateStep(step)) {
          event.preventDefault();
        } else {
          quiz.classList.add('quiz-complete');
        }
      });
    }

    update();
  }

  const forms = document.querySelectorAll('form[data-validate]');
  forms.forEach((form) => {
    form.addEventListener('submit', (event) => {
      let isValid = true;
      const requiredFields = form.querySelectorAll('[data-required]');

      requiredFields.forEach((field) => {
        if (field.type === 'checkbox' || field.type === 'radio') {
          const name = field.name;
          const checked = form.querySelectorAll(`[name="${name}"]:checked`).length > 0;
          if (!checked) {
            isValid = false;
            field.classList.add('error');
          } else {
            field.classList.remove('error');
          }
        } else if (!field.value.trim()) {
          isValid = false;
          field.classList.add('error');
        } else {
          field.classList.remove('error');
        }
      });

      if (!isValid) {
        event.preventDefault();
      }
    });
  });

  const revealTargets = document.querySelectorAll(
    '.hero, .section, .card, .media-card, .stats-item, .pricing-card, .faq-item, .process-step, .stepper-step, .quiz, .logo-card, footer .container'
  );

  if (revealTargets.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -10%'
      }
    );

    revealTargets.forEach((target) => {
      target.classList.add('will-reveal');
      observer.observe(target);
    });
  }

  const parallaxTargets = document.querySelectorAll('[data-parallax]');

  if (parallaxTargets.length && !prefersReducedMotion) {
    let pointerX = 0;
    let pointerY = 0;
    let ticking = false;

    const applyParallax = () => {
      const rotateX = ((pointerY / window.innerHeight) - 0.5) * -6;
      const rotateY = ((pointerX / window.innerWidth) - 0.5) * 6;

      parallaxTargets.forEach((element) => {
        element.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      });

      ticking = false;
    };

    window.addEventListener('pointermove', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;

      if (!ticking) {
        window.requestAnimationFrame(applyParallax);
        ticking = true;
      }
    });

    window.addEventListener('pointerleave', () => {
      parallaxTargets.forEach((element) => {
        element.style.transform = '';
      });
    });
  }
});
