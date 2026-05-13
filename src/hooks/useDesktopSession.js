import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getRuntimeConfigSync, mergeRuntimeConfig } from '../lib/runtimeConfig.js';
import { retrievePortfolio } from '../utils/api.js';
import { loadActivePortfolioId, setActivePortfolioId } from '../utils/activePortfolioStorage.js';
import {
  getDesktopBridge,
  getInitialDesktopLocked,
  normalizeDesktopPin,
  formatDesktopSessionError,
  isPortfolioSessionAuthError,
  formatPortfolioLoadError,
} from '../utils/desktopSession.js';

export default function useDesktopSession({ applyLoadedPortfolioRef, pushToastRef, t }) {
  const runtimeConfig = getRuntimeConfigSync();
  const desktopBridge = getDesktopBridge();
  const initialDesktopLocked = getInitialDesktopLocked();
  const [sessionLocked, setSessionLocked] = useState(initialDesktopLocked);
  const [sessionLoading, setSessionLoading] = useState(initialDesktopLocked);
  const [sessionSubmitting, setSessionSubmitting] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(() => {
    const storedId = loadActivePortfolioId();
    const runtimePortfolioId =
      typeof runtimeConfig?.ACTIVE_PORTFOLIO_ID === 'string' &&
      runtimeConfig.ACTIVE_PORTFOLIO_ID.trim().length > 0
        ? runtimeConfig.ACTIVE_PORTFOLIO_ID.trim()
        : '';
    return runtimePortfolioId || storedId || '';
  });
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [portfolioId, setPortfolioId] = useState('');
  const bootstrapLoadAttemptedRef = useRef(false);

  const selectedPortfolio = useMemo(
    () => portfolios.find((entry) => entry.id === selectedPortfolioId) ?? null,
    [portfolios, selectedPortfolioId]
  );
  const desktopRequiresPinSetup = sessionLocked && selectedPortfolio?.hasPin === false;

  const recoverFromPortfolioLoadError = useCallback(
    (error, requestedPortfolioId = '') => {
      if (!isPortfolioSessionAuthError(error)) {
        return false;
      }

      const message = formatPortfolioLoadError(error, t);
      const normalizedPortfolioId =
        typeof requestedPortfolioId === 'string' ? requestedPortfolioId.trim() : '';

      setActivePortfolioId(null);
      bootstrapLoadAttemptedRef.current = false;

      if (desktopBridge) {
        setSessionError(message);
        setSessionLocked(true);
        setSessionLoading(true);
        setSessionSubmitting(false);
        setPin('');
        setPinConfirm('');
        if (normalizedPortfolioId) {
          setSelectedPortfolioId((current) => current || normalizedPortfolioId);
        }
        return true;
      }

      setPortfolioId('');
      const toastFn = pushToastRef?.current;
      if (toastFn) {
        toastFn({
          type: 'error',
          title: t('portfolioControls.toast.loadError.title', {
            id: normalizedPortfolioId || 'desktop',
          }),
          message,
        });
      }
      return true;
    },
    [desktopBridge, pushToastRef, t]
  );

  // List desktop portfolios when locked
  useEffect(() => {
    if (!desktopBridge || !sessionLocked) {
      return undefined;
    }

    let cancelled = false;
    setSessionLoading(true);
    void desktopBridge
      .listPortfolios()
      .then((result) => {
        if (cancelled) {
          return;
        }
        const resultPortfolios = Array.isArray(result?.portfolios) ? result.portfolios : [];
        setPortfolios(resultPortfolios);
        setSelectedPortfolioId((current) => {
          const requested =
            current && resultPortfolios.some((entry) => entry.id === current) ? current : '';
          if (requested) {
            return requested;
          }
          const nextDefault =
            typeof result?.defaultPortfolioId === 'string' ? result.defaultPortfolioId.trim() : '';
          if (nextDefault && resultPortfolios.some((entry) => entry.id === nextDefault)) {
            return nextDefault;
          }
          return resultPortfolios[0]?.id ?? '';
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setSessionError(formatDesktopSessionError(error, t));
      })
      .finally(() => {
        if (!cancelled) {
          setSessionLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [desktopBridge, sessionLocked, t]);

  const unlockSession = useCallback(async () => {
    if (!desktopBridge) {
      return;
    }
    const selectedId = selectedPortfolioId.trim();
    const normalizedPin = normalizeDesktopPin(pin);
    const normalizedPinConfirm = normalizeDesktopPin(pinConfirm);

    if (!selectedId) {
      setSessionError(t('desktopSession.error.PORTFOLIO_REQUIRED'));
      return;
    }
    if (!/^\d{4,12}$/u.test(normalizedPin)) {
      setSessionError(t('desktopSession.error.INVALID_PIN_FORMAT'));
      return;
    }
    if (desktopRequiresPinSetup && normalizedPin !== normalizedPinConfirm) {
      setSessionError(t('desktopSession.error.INVALID_PIN_CONFIRMATION'));
      return;
    }

    setSessionSubmitting(true);
    setSessionError('');
    try {
      const session = desktopRequiresPinSetup
        ? await desktopBridge.setupPin({ portfolioId: selectedId, pin: normalizedPin })
        : await desktopBridge.unlockSession({ portfolioId: selectedId, pin: normalizedPin });

      mergeRuntimeConfig(session?.runtimeConfig ?? {});
      setActivePortfolioId(selectedId);
      setPortfolioId(selectedId);
      setSessionLocked(false);
      setPin('');
      setPinConfirm('');
      bootstrapLoadAttemptedRef.current = true;

      const { data } = await retrievePortfolio(selectedId);
      const applyFn = applyLoadedPortfolioRef?.current;
      if (applyFn) {
        applyFn(data, selectedId);
      }
    } catch (error) {
      if (recoverFromPortfolioLoadError(error, selectedId)) {
        return;
      }
      setSessionError(formatDesktopSessionError(error, t));
    } finally {
      setSessionSubmitting(false);
    }
  }, [
    desktopBridge,
    pin,
    pinConfirm,
    desktopRequiresPinSetup,
    selectedPortfolioId,
    recoverFromPortfolioLoadError,
    applyLoadedPortfolioRef,
    t,
  ]);

  // Bootstrap load: auto-load portfolio on mount
  useEffect(() => {
    if (sessionLocked) {
      return;
    }
    if (bootstrapLoadAttemptedRef.current) {
      return;
    }

    const storedId = loadActivePortfolioId();
    const currentRuntimeConfig = getRuntimeConfigSync();
    const runtimePortfolioId =
      typeof currentRuntimeConfig?.ACTIVE_PORTFOLIO_ID === 'string' &&
      currentRuntimeConfig.ACTIVE_PORTFOLIO_ID.trim().length > 0
        ? currentRuntimeConfig.ACTIVE_PORTFOLIO_ID.trim()
        : '';
    const initialPortfolioId = runtimePortfolioId || storedId;

    if (!initialPortfolioId) {
      return;
    }

    let cancelled = false;
    let completed = false;
    bootstrapLoadAttemptedRef.current = true;

    setPortfolioId((current) =>
      current && current.trim().length > 0 ? current : initialPortfolioId
    );
    void retrievePortfolio(initialPortfolioId)
      .then(({ data }) => {
        completed = true;
        if (cancelled) return;
        const applyFn = applyLoadedPortfolioRef?.current;
        if (applyFn) {
          applyFn(data, initialPortfolioId);
        }
      })
      .catch((error) => {
        completed = true;
        if (cancelled) return;
        if (recoverFromPortfolioLoadError(error, initialPortfolioId)) {
          return;
        }
        console.error('Failed to bootstrap initial portfolio', error);
      });

    return () => {
      cancelled = true;
      if (!completed) {
        bootstrapLoadAttemptedRef.current = false;
      }
    };
  }, [sessionLocked, recoverFromPortfolioLoadError, applyLoadedPortfolioRef]);

  return {
    sessionLocked,
    sessionLoading,
    sessionSubmitting,
    sessionError,
    setSessionError,
    portfolios,
    selectedPortfolioId,
    setSelectedPortfolioId,
    pin,
    setPin,
    pinConfirm,
    setPinConfirm,
    desktopRequiresPinSetup,
    unlockSession,
    recoverFromPortfolioLoadError,
    bootstrapLoadAttemptedRef,
    desktopBridge,
    portfolioId,
    setPortfolioId,
  };
}
