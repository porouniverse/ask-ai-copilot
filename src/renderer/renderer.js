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
