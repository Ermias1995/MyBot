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
    webApp.MainButton.show();
  },
  hide(onClick) {
    const webApp = getWebApp();
    if (!webApp) return;
    if (onClick) webApp.MainButton.offClick(onClick);
    webApp.MainButton.hide();
  },
};
