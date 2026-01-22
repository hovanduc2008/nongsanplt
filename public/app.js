let news = window.__NEWS__ || [];
let index = 0;

const viewport = document.querySelector(".viewport");

function render() {
  if (!news.length) return;

  const n = news[index % news.length];

  viewport.innerHTML = `
    <div class="card">
      <div class="tag">${n.tag}</div>
      <h1>${n.title}</h1>
      <div class="summary">${n.summary}</div>
      <div class="insight"><span>Insight:</span> ${n.insight}</div>
    </div>
  `;
}

render();

let startY = 0;
viewport.addEventListener("touchstart", e => {
  startY = e.touches[0].clientY;
});

viewport.addEventListener("touchend", e => {
  if (startY - e.changedTouches[0].clientY > 60) {
    index++;
    render();
  }
});
