document.addEventListener('DOMContentLoaded', () => {
  const menuToggle = document.querySelector('.menu-toggle');
  const navList = document.querySelector('nav ul');

  if (menuToggle && navList) {
    menuToggle.addEventListener('click', () => {
      navList.classList.toggle('open');
    });
  }

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
        if ((field.type === 'checkbox' || field.type === 'radio')) {
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
});
