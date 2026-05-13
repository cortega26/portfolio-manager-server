import { Suspense } from 'react';
import LoadingFallback from './LoadingFallback.jsx';
import TodayTab from './review/TodayTab.jsx';
import DashboardTab from './DashboardTab.jsx';
import HoldingsTab from './HoldingsTab.jsx';
import PricesTab from './PricesTab.jsx';
import InboxTab from './InboxTab.jsx';
import TransactionsTab from './TransactionsTab.jsx';
import HistoryTab from './HistoryTab.jsx';
import MetricsTab from './MetricsTab.jsx';
import RealizedGainsView from './RealizedGainsView.jsx';
import ReportsTab from './ReportsTab.jsx';
import SettingsTab from './SettingsTab.jsx';

export default function TabPanel(props) {
  const {
    activeTab,
    setActiveTab,
    portfolioId,
    metrics,
    roiData,
    benchmarkSummary,
    returnsSummary,
    navDaily,
    transactions,
    loadingRoi,
    roiSource,
    roiMeta,
    benchmarkCatalog,
    openHoldings,
    currentPrices,
    signals,
    signalRows,
    compactTables,
    handleRefreshRoi,
    handleSignalChange,
    handleAddTransaction,
    handleDeleteTransaction,
    priceBoardRows,
    portfolioSummary,
    pricesTabState,
    refreshTrackedPrices,
    historyMonthlyBreakdown,
    historyTimeline,
    metricCards,
    allocationBreakdown,
    performanceHighlights,
    reportSummaryCards,
    handleExportTransactions,
    handleExportHoldings,
    handleExportPerformance,
    settings,
    schedulerStatus,
    handleSettingChange,
    handleResetSettings,
  } = props;

  return (
    <Suspense fallback={<LoadingFallback />}>
      {activeTab === 'Today' && (
        <TodayTab
          portfolioId={portfolioId}
          inboxItems={[]}
          recentChanges={[]}
          navDaily={navDaily}
          degradedReasons={[]}
          staleTickers={[]}
        />
      )}
      {activeTab === 'Dashboard' && (
        <section
          role="tabpanel"
          id="panel-dashboard"
          aria-labelledby="tab-dashboard"
          data-testid="panel-dashboard"
        >
          <DashboardTab
            portfolioId={portfolioId}
            metrics={metrics}
            roiData={roiData}
            benchmarkSummary={benchmarkSummary}
            returnsSummary={returnsSummary}
            navDaily={navDaily}
            transactions={transactions}
            loadingRoi={loadingRoi}
            roiSource={roiSource}
            roiMeta={roiMeta}
            benchmarkCatalog={benchmarkCatalog}
            onRefreshRoi={handleRefreshRoi}
            openHoldings={openHoldings}
            currentPrices={currentPrices}
            onNavigateToInbox={() => setActiveTab('Inbox')}
          />
        </section>
      )}

      {activeTab === 'Holdings' && (
        <section
          role="tabpanel"
          id="panel-holdings"
          aria-labelledby="tab-holdings"
          data-testid="panel-holdings"
        >
          <HoldingsTab
            holdings={openHoldings}
            transactions={transactions}
            currentPrices={currentPrices}
            signals={signals}
            signalRows={signalRows}
            onSignalChange={handleSignalChange}
            compact={compactTables}
          />
        </section>
      )}

      {activeTab === 'Prices' && (
        <section
          role="tabpanel"
          id="panel-prices"
          aria-labelledby="tab-prices"
          data-testid="panel-prices"
        >
          <PricesTab
            rows={priceBoardRows}
            summary={portfolioSummary}
            loading={pricesTabState.loading}
            onRefresh={() => refreshTrackedPrices()}
            lastUpdatedAt={pricesTabState.lastUpdatedAt}
            requestId={pricesTabState.requestId}
            version={pricesTabState.version}
          />
        </section>
      )}

      {activeTab === 'Inbox' && (
        <section
          role="tabpanel"
          id="panel-inbox"
          aria-labelledby="tab-inbox"
          data-testid="panel-inbox"
        >
          <InboxTab
            portfolioId={portfolioId}
            holdings={openHoldings}
            transactions={transactions}
            currentPrices={currentPrices}
            signals={signals}
            signalRows={signalRows}
            onSignalChange={handleSignalChange}
            compact={compactTables}
            onNavigateToHoldings={() => setActiveTab('Holdings')}
          />
        </section>
      )}

      {activeTab === 'Transactions' && (
        <section
          role="tabpanel"
          id="panel-transactions"
          aria-labelledby="tab-transactions"
          data-testid="panel-transactions"
        >
          <TransactionsTab
            transactions={transactions}
            onAddTransaction={handleAddTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            compact={compactTables}
            holdings={openHoldings}
            cashBalance={portfolioSummary?.cashBalance ?? null}
          />
        </section>
      )}

      {activeTab === 'History' && (
        <section
          role="tabpanel"
          id="panel-history"
          aria-labelledby="tab-history"
          data-testid="panel-history"
        >
          <HistoryTab
            monthlyBreakdown={historyMonthlyBreakdown}
            timeline={historyTimeline}
            compact={compactTables}
          />
        </section>
      )}

      {activeTab === 'Metrics' && (
        <section
          role="tabpanel"
          id="panel-metrics"
          aria-labelledby="tab-metrics"
          data-testid="panel-metrics"
        >
          <MetricsTab
            metricCards={metricCards}
            allocations={allocationBreakdown}
            performance={performanceHighlights}
          />
        </section>
      )}

      {activeTab === 'RealizedGains' && (
        <section
          role="tabpanel"
          id="panel-realizedgains"
          aria-labelledby="tab-realizedgains"
          data-testid="panel-realizedgains"
        >
          <RealizedGainsView portfolioId={portfolioId} />
        </section>
      )}

      {activeTab === 'Reports' && (
        <section
          role="tabpanel"
          id="panel-reports"
          aria-labelledby="tab-reports"
          data-testid="panel-reports"
        >
          <ReportsTab
            summaryCards={reportSummaryCards}
            onExportTransactions={handleExportTransactions}
            onExportHoldings={handleExportHoldings}
            onExportPerformance={handleExportPerformance}
          />
        </section>
      )}

      {activeTab === 'Settings' && (
        <section
          role="tabpanel"
          id="panel-settings"
          aria-labelledby="tab-settings"
          data-testid="panel-settings"
        >
          <SettingsTab
            settings={settings}
            schedulerStatus={schedulerStatus}
            onSettingChange={handleSettingChange}
            onReset={handleResetSettings}
          />
        </section>
      )}
    </Suspense>
  );
}
