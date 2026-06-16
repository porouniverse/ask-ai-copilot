const searchInput = document.getElementById('searchInput');

window.electronAPI.onWindowShown(() => {
  searchInput.value = '';
  searchInput.focus();
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const text = searchInput.value.trim();
    if (text) {
      window.electronAPI.submitInput(text);
    }
  } else if (e.key === 'Escape') {
    window.electronAPI.closeWindow();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.electronAPI.closeWindow();
  }
});

let dragging = false;
let dragBlocked = false;

searchInput.addEventListener('mousedown', (e) => {
  const range = document.caretRangeFromPoint(e.clientX, e.clientY);
  if (range) {
    const sel = document.getSelection();
    if (sel && sel.toString().length > 0) {
      let inside = false;
      for (let i = 0; i < sel.rangeCount; i++) {
        if (sel.getRangeAt(i).intersectsNode(range.startContainer)) {
          inside = true;
          break;
        }
      }
      dragBlocked = inside;
      if (inside) return;
    }
  }
  dragging = true;
  window.electronAPI.startWindowDrag(e.screenX, e.screenY);
});

document.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  window.electronAPI.moveWindow(e.screenX, e.screenY);
});

document.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  window.electronAPI.endWindowDrag();
});
