import { getRuntimeConfigSync } from '../lib/runtimeConfig.js';

export const DESKTOP_SESSION_ERROR_KEYS = {
  INVALID_PIN: 'desktopSession.error.INVALID_PIN',
  INVALID_PIN_CONFIRMATION: 'desktopSession.error.INVALID_PIN_CONFIRMATION',
  INVALID_PIN_FORMAT: 'desktopSession.error.INVALID_PIN_FORMAT',
  INVALID_PORTFOLIO_ID: 'desktopSession.error.INVALID_PORTFOLIO_ID',
  PORTFOLIO_NOT_FOUND: 'desktopSession.error.PORTFOLIO_NOT_FOUND',
  PORTFOLIO_REQUIRED: 'desktopSession.error.PORTFOLIO_REQUIRED',
  PIN_ALREADY_SET: 'desktopSession.error.PIN_ALREADY_SET',
  DESKTOP_SESSION_ERROR: 'desktopSession.error.generic',
};

export const PORTFOLIO_LOAD_ERROR_KEYS = {
  INVALID_SESSION_TOKEN: 'portfolioControls.error.INVALID_SESSION_TOKEN',
  NO_SESSION_TOKEN: 'portfolioControls.error.NO_SESSION_TOKEN',
  SESSION_AUTH_MISCONFIGURED: 'portfolioControls.error.SESSION_AUTH_MISCONFIGURED',
  PORTFOLIO_NOT_FOUND: 'portfolioControls.error.PORTFOLIO_NOT_FOUND',
};

export const PORTFOLIO_LOAD_STATUS_KEYS = {
  400: 'portfolioControls.error.status.400',
  401: 'portfolioControls.error.status.401',
  403: 'portfolioControls.error.status.403',
  404: 'portfolioControls.error.status.404',
  429: 'portfolioControls.error.status.429',
  500: 'portfolioControls.error.status.500',
};

export function getDesktopBridge() {
  if (typeof window === 'undefined') {
    return null;
  }
  const bridge = window.portfolioDesktop;
  if (!bridge || bridge.isAvailable !== true) {
    return null;
  }
  return bridge;
}

export function hasRuntimeSessionToken(runtimeConfig) {
  return (
    typeof runtimeConfig?.API_SESSION_TOKEN === 'string' &&
    runtimeConfig.API_SESSION_TOKEN.trim().length > 0
  );
}

export function normalizeDesktopPin(pin) {
  if (typeof pin !== 'string') {
    return '';
  }
  return pin.trim();
}

export function getInitialDesktopLocked() {
  const bridge = getDesktopBridge();
  const runtimeConfig = getRuntimeConfigSync();
  return Boolean(bridge && !hasRuntimeSessionToken(runtimeConfig));
}

export function formatDesktopSessionError(error, t) {
  const code =
    typeof error?.code === 'string' && error.code.trim().length > 0 ? error.code.trim() : null;
  const errorKey = code ? DESKTOP_SESSION_ERROR_KEYS[code] : null;
  if (errorKey) {
    return t(errorKey);
  }
  if (typeof error?.message === 'string' && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return t('desktopSession.error.generic');
}

export function isPortfolioSessionAuthError(error) {
  if (!error || error.name !== 'ApiError') {
    return false;
  }
  const code =
    typeof error.body?.error === 'string' && error.body.error.trim().length > 0
      ? error.body.error.trim()
      : '';
  if (
    code === 'NO_SESSION_TOKEN' ||
    code === 'INVALID_SESSION_TOKEN' ||
    code === 'SESSION_AUTH_MISCONFIGURED'
  ) {
    return true;
  }
  return false;
}

export function formatPortfolioLoadError(error, t) {
  if (error?.name === 'ApiError') {
    const code =
      typeof error.body?.error === 'string' && error.body.error.trim().length > 0
        ? error.body.error.trim()
        : '';
    const errorKey = code ? PORTFOLIO_LOAD_ERROR_KEYS[code] : null;
    if (errorKey) {
      return t(errorKey);
    }
    const statusKey = PORTFOLIO_LOAD_STATUS_KEYS[error.status];
    if (statusKey) {
      return t(statusKey);
    }
  }
  if (typeof error?.message === 'string' && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return t('portfolioControls.status.genericError');
}
