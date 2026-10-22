(function () {
  'use strict';

  document.querySelectorAll('[data-case-image] img').forEach(function (image) {
    function hideUnavailableImage() {
      image.hidden = true;
      image.parentElement.classList.add('is-unavailable');
    }

    image.addEventListener('error', hideUnavailableImage);
    if (image.complete && image.naturalWidth === 0) hideUnavailableImage();
  });

  var quiz = document.querySelector('[data-home-quiz]');
  if (!quiz) return;

  var screens = Array.prototype.slice.call(quiz.querySelectorAll('[data-quiz-screen]'));
  var results = Array.prototype.slice.call(quiz.querySelectorAll('[data-quiz-result]'));

  function show(screenName, resultName) {
    screens.forEach(function (screen) {
      screen.hidden = screen.dataset.quizScreen !== screenName;
    });
    results.forEach(function (result) {
      result.hidden = result.dataset.quizResult !== resultName;
    });

    var heading = quiz.querySelector('[data-quiz-screen="' + screenName + '"]:not([hidden]) [data-quiz-heading]:not([hidden])');
    if (screenName === 'result') {
      heading = quiz.querySelector('[data-quiz-result="' + resultName + '"] [data-quiz-heading]');
    }
    if (heading) heading.focus({ preventScroll: true });
  }

  quiz.addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (!button || !quiz.contains(button)) return;

    if (button.dataset.quizCar === 'yes') show('goal');
    else if (button.dataset.quizCar === 'no') show('result', 'explore');
    else if (button.dataset.quizGoal) {
      show('result', button.dataset.quizGoal === 'diagnostics' ? 'diagnostics' : 'full');
    } else if (button.hasAttribute('data-quiz-back') || button.hasAttribute('data-quiz-restart')) {
      show('car');
    }
  });
})();
