export function getWebApp() {
  return window.Telegram?.WebApp ?? null;
}

export function initTelegram() {
  const webApp = getWebApp();
  if (!webApp) return null;
  webApp.ready();
  webApp.expand();
  return webApp;
}

export function getInitData() {
  return getWebApp()?.initData ?? '';
}

export const mainButton = {
  show(text, onClick) {
    const webApp = getWebApp();
    if (!webApp) return;
    webApp.MainButton.setText(text);
    webApp.MainButton.onClick(onClick);
    webApp.MainButton.enable();
    webApp.MainButton.show();
  },
  setText(text) {
    getWebApp()?.MainButton.setText(text);
  },
  enable() {
    getWebApp()?.MainButton.enable();
  },
  disable() {
    getWebApp()?.MainButton.disable();
  },
  showProgress() {
    getWebApp()?.MainButton.showProgress?.(false);
  },
  hideProgress() {
    getWebApp()?.MainButton.hideProgress?.();
  },
  hide(onClick) {
    const webApp = getWebApp();
    if (!webApp) return;
    if (onClick) webApp.MainButton.offClick(onClick);
    webApp.MainButton.hide();
  },
};

export const backButton = {
  show(onClick) {
    const webApp = getWebApp();
    if (!webApp?.BackButton) return;
    webApp.BackButton.onClick(onClick);
    webApp.BackButton.show();
  },
  hide(onClick) {
    const webApp = getWebApp();
    if (!webApp?.BackButton) return;
    if (onClick) webApp.BackButton.offClick(onClick);
    webApp.BackButton.hide();
  },
};

export function haptic(type = 'light') {
  try {
    getWebApp()?.HapticFeedback?.impactOccurred?.(type);
  } catch {
    /* ignore */
  }
}
