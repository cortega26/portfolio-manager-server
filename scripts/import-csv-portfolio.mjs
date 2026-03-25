import path from 'node:path';
import process from 'node:process';

import { importCsvPortfolio } from '../server/import/csvPortfolioImport.js';

function parseArgs(argv) {
  const options = {
    dataDir: process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data'),
    portfolioId: 'desktop',
    sourceDir: process.cwd(),
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case '--data-dir':
        options.dataDir = path.resolve(argv[index + 1]);
        index += 1;
        break;
      case '--portfolio-id':
        options.portfolioId = argv[index + 1];
        index += 1;
        break;
      case '--source-dir':
        options.sourceDir = path.resolve(argv[index + 1]);
        index += 1;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  return options;
}

function printSummary(result) {
  process.stdout.write(`portfolioId: ${result.portfolioId}\n`);
  process.stdout.write(`storage: ${path.resolve(result.dataDir ?? process.cwd(), 'storage.sqlite')}\n`);
  process.stdout.write(`transactionCount: ${result.transactionCount}\n`);
  process.stdout.write(`dryRun: ${result.dryRun}\n`);
  process.stdout.write('holdings:\n');
  for (const [ticker, quantity] of Object.entries(result.reconciliation.holdings)) {
    process.stdout.write(`  ${ticker}: ${quantity}\n`);
  }
  process.stdout.write(`cash:\n  USD: ${result.reconciliation.cashByCurrency.USD ?? '0.00'}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await importCsvPortfolio(options);
  printSummary({ ...result, dataDir: options.dataDir });
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
