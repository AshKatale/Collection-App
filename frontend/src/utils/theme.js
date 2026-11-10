const KEY = 'theme';

const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** 'light' | 'dark' – saved choice, else the OS preference. */
export function currentTheme() {
  const saved = read();
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#12171d' : '#1f6f5c');
}

export function setTheme(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable – theme just won't persist */
  }
  applyTheme(theme);
}

export function initTheme() {
  applyTheme(currentTheme());
}
