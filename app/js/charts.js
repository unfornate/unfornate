(function () {
  function ensureChart(ctx) {
    if (!window.Chart) {
      console.warn('Chart.js не найден');
      return null;
    }
    const canvas = typeof ctx === 'string' ? document.getElementById(ctx) : ctx;
    if (!canvas) return null;
    if (canvas.__chart) {
      canvas.__chart.destroy();
    }
    return canvas;
  }

  function createChart(ctx, config) {
    const canvas = ensureChart(ctx);
    if (!canvas) return null;
    const chart = new Chart(canvas.getContext('2d'), config);
    canvas.__chart = chart;
    return chart;
  }

  function gradient(ctx, colors) {
    const canvas = typeof ctx === 'string' ? document.getElementById(ctx) : ctx;
    if (!canvas) return null;
    const g = canvas.getContext('2d').createLinearGradient(0, 0, 0, canvas.height || 300);
    colors.forEach(([offset, color]) => g.addColorStop(offset, color));
    return g;
  }

  function destroy(ctx) {
    const canvas = typeof ctx === 'string' ? document.getElementById(ctx) : ctx;
    if (canvas && canvas.__chart) {
      canvas.__chart.destroy();
      canvas.__chart = null;
    }
  }

  window.ChartUtils = {
    createChart,
    gradient,
    destroy
  };
})();
