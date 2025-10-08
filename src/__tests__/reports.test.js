import { describe, expect, it } from 'vitest';
import { buildPerformanceCsv, buildSecurityEventsCsv } from '../utils/reports.js';

describe('buildPerformanceCsv', () => {
  it('includes benchmark series columns in the header and rows', () => {
    const csv = buildPerformanceCsv([
      {
        date: '2024-01-02',
        portfolio: 0.01234,
        spy: 0.01001,
        blended: 0.0095,
        exCash: 0.01111,
        cash: 0.0005,
      },
    ]);

    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe(
      'date,portfolio_roi,spy_roi,blended_roi,ex_cash_roi,cash_roi,spy_spread',
    );
    expect(lines[1]).toBe(
      '2024-01-02,1.234%,1.001%,0.95%,1.111%,0.05%,0.233%',
    );
  });
});

describe('buildSecurityEventsCsv', () => {
  it('serialises security events with request metadata', () => {
    const csv = buildSecurityEventsCsv([
      {
        timestamp: '2024-01-05T12:00:00Z',
        event: 'auth_failed',
        portfolio_id: 'demo',
        ip: '127.0.0.1',
        user_agent: 'vitest',
        request_id: 'req-1',
        attempts: 3,
      },
    ]);

    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe(
      'timestamp,event,portfolio_id,ip,user_agent,request_id,metadata',
    );
    expect(lines[1]).toBe(
      '2024-01-05T12:00:00Z,auth_failed,demo,127.0.0.1,vitest,req-1,"{""attempts"":3}"',
    );
  });
});
