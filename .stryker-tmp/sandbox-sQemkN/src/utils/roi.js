// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
export const BENCHMARK_SERIES_META = stryMutAct_9fa48("0") ? [] : (stryCov_9fa48("0"), [stryMutAct_9fa48("1") ? {} : (stryCov_9fa48("1"), {
  id: stryMutAct_9fa48("2") ? "" : (stryCov_9fa48("2"), "spy"),
  dataKey: stryMutAct_9fa48("3") ? "" : (stryCov_9fa48("3"), "spy"),
  label: stryMutAct_9fa48("4") ? "" : (stryCov_9fa48("4"), "100% SPY benchmark"),
  description: stryMutAct_9fa48("5") ? "" : (stryCov_9fa48("5"), "Opportunity cost if fully invested in SPY"),
  color: stryMutAct_9fa48("6") ? "" : (stryCov_9fa48("6"), "#6366f1")
}), stryMutAct_9fa48("7") ? {} : (stryCov_9fa48("7"), {
  id: stryMutAct_9fa48("8") ? "" : (stryCov_9fa48("8"), "blended"),
  dataKey: stryMutAct_9fa48("9") ? "" : (stryCov_9fa48("9"), "blended"),
  label: stryMutAct_9fa48("10") ? "" : (stryCov_9fa48("10"), "Blended benchmark"),
  description: stryMutAct_9fa48("11") ? "" : (stryCov_9fa48("11"), "Risk-matched mix using start-of-day cash weights"),
  color: stryMutAct_9fa48("12") ? "" : (stryCov_9fa48("12"), "#f97316")
}), stryMutAct_9fa48("13") ? {} : (stryCov_9fa48("13"), {
  id: stryMutAct_9fa48("14") ? "" : (stryCov_9fa48("14"), "exCash"),
  dataKey: stryMutAct_9fa48("15") ? "" : (stryCov_9fa48("15"), "exCash"),
  label: stryMutAct_9fa48("16") ? "" : (stryCov_9fa48("16"), "Risk sleeve (ex-cash)"),
  description: stryMutAct_9fa48("17") ? "" : (stryCov_9fa48("17"), "Portfolio performance excluding the cash sleeve"),
  color: stryMutAct_9fa48("18") ? "" : (stryCov_9fa48("18"), "#ec4899")
}), stryMutAct_9fa48("19") ? {} : (stryCov_9fa48("19"), {
  id: stryMutAct_9fa48("20") ? "" : (stryCov_9fa48("20"), "cash"),
  dataKey: stryMutAct_9fa48("21") ? "" : (stryCov_9fa48("21"), "cash"),
  label: stryMutAct_9fa48("22") ? "" : (stryCov_9fa48("22"), "Cash yield"),
  description: stryMutAct_9fa48("23") ? "" : (stryCov_9fa48("23"), "Isolated cash performance with accrued interest"),
  color: stryMutAct_9fa48("24") ? "" : (stryCov_9fa48("24"), "#0ea5e9")
})]);
const SERIES_SOURCE_KEYS = stryMutAct_9fa48("25") ? {} : (stryCov_9fa48("25"), {
  portfolio: stryMutAct_9fa48("26") ? "" : (stryCov_9fa48("26"), "r_port"),
  spy: stryMutAct_9fa48("27") ? "" : (stryCov_9fa48("27"), "r_spy_100"),
  blended: stryMutAct_9fa48("28") ? "" : (stryCov_9fa48("28"), "r_bench_blended"),
  exCash: stryMutAct_9fa48("29") ? "" : (stryCov_9fa48("29"), "r_ex_cash"),
  cash: stryMutAct_9fa48("30") ? "" : (stryCov_9fa48("30"), "r_cash")
});
const TYPE_ORDER = stryMutAct_9fa48("31") ? {} : (stryCov_9fa48("31"), {
  DEPOSIT: 1,
  BUY: 2,
  SELL: 3,
  DIVIDEND: 4,
  INTEREST: 5,
  WITHDRAWAL: 6,
  FEE: 7
});
const CASH_IN_TYPES = new Set(stryMutAct_9fa48("32") ? [] : (stryCov_9fa48("32"), [stryMutAct_9fa48("33") ? "" : (stryCov_9fa48("33"), "DEPOSIT")]));
const CASH_OUT_TYPES = new Set(stryMutAct_9fa48("34") ? [] : (stryCov_9fa48("34"), [stryMutAct_9fa48("35") ? "" : (stryCov_9fa48("35"), "WITHDRAWAL"), stryMutAct_9fa48("36") ? "" : (stryCov_9fa48("36"), "FEE")]));
const INCOME_TYPES = new Set(stryMutAct_9fa48("37") ? [] : (stryCov_9fa48("37"), [stryMutAct_9fa48("38") ? "" : (stryCov_9fa48("38"), "DIVIDEND"), stryMutAct_9fa48("39") ? "" : (stryCov_9fa48("39"), "INTEREST")]));
const SHARE_TYPES = new Set(stryMutAct_9fa48("40") ? [] : (stryCov_9fa48("40"), [stryMutAct_9fa48("41") ? "" : (stryCov_9fa48("41"), "BUY"), stryMutAct_9fa48("42") ? "" : (stryCov_9fa48("42"), "SELL")]));
const SHARE_EPSILON = 1e-8;
function toFiniteNumber(value) {
  if (stryMutAct_9fa48("43")) {
    {}
  } else {
    stryCov_9fa48("43");
    if (stryMutAct_9fa48("46") ? value === null && value === undefined : stryMutAct_9fa48("45") ? false : stryMutAct_9fa48("44") ? true : (stryCov_9fa48("44", "45", "46"), (stryMutAct_9fa48("48") ? value !== null : stryMutAct_9fa48("47") ? false : (stryCov_9fa48("47", "48"), value === null)) || (stryMutAct_9fa48("50") ? value !== undefined : stryMutAct_9fa48("49") ? false : (stryCov_9fa48("49", "50"), value === undefined)))) {
      if (stryMutAct_9fa48("51")) {
        {}
      } else {
        stryCov_9fa48("51");
        return 0;
      }
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }
}
function toComparableTimestamp(value) {
  if (stryMutAct_9fa48("52")) {
    {}
  } else {
    stryCov_9fa48("52");
    if (stryMutAct_9fa48("55") ? typeof value === "number" && Number.isFinite(value) || value >= 0 : stryMutAct_9fa48("54") ? false : stryMutAct_9fa48("53") ? true : (stryCov_9fa48("53", "54", "55"), (stryMutAct_9fa48("57") ? typeof value === "number" || Number.isFinite(value) : stryMutAct_9fa48("56") ? true : (stryCov_9fa48("56", "57"), (stryMutAct_9fa48("59") ? typeof value !== "number" : stryMutAct_9fa48("58") ? true : (stryCov_9fa48("58", "59"), typeof value === (stryMutAct_9fa48("60") ? "" : (stryCov_9fa48("60"), "number")))) && Number.isFinite(value))) && (stryMutAct_9fa48("63") ? value < 0 : stryMutAct_9fa48("62") ? value > 0 : stryMutAct_9fa48("61") ? true : (stryCov_9fa48("61", "62", "63"), value >= 0)))) {
      if (stryMutAct_9fa48("64")) {
        {}
      } else {
        stryCov_9fa48("64");
        return Math.trunc(value);
      }
    }
    if (stryMutAct_9fa48("67") ? typeof value !== "string" : stryMutAct_9fa48("66") ? false : stryMutAct_9fa48("65") ? true : (stryCov_9fa48("65", "66", "67"), typeof value === (stryMutAct_9fa48("68") ? "" : (stryCov_9fa48("68"), "string")))) {
      if (stryMutAct_9fa48("69")) {
        {}
      } else {
        stryCov_9fa48("69");
        const trimmed = stryMutAct_9fa48("70") ? value : (stryCov_9fa48("70"), value.trim());
        if (stryMutAct_9fa48("73") ? trimmed !== "" : stryMutAct_9fa48("72") ? false : stryMutAct_9fa48("71") ? true : (stryCov_9fa48("71", "72", "73"), trimmed === (stryMutAct_9fa48("74") ? "Stryker was here!" : (stryCov_9fa48("74"), "")))) {
          if (stryMutAct_9fa48("75")) {
            {}
          } else {
            stryCov_9fa48("75");
            return 0;
          }
        }
        const parsed = Number.parseInt(trimmed, 10);
        return Number.isNaN(parsed) ? 0 : parsed;
      }
    }
    return 0;
  }
}
function toComparableSeq(value) {
  if (stryMutAct_9fa48("76")) {
    {}
  } else {
    stryCov_9fa48("76");
    if (stryMutAct_9fa48("79") ? typeof value === "number" && Number.isInteger(value) || value >= 0 : stryMutAct_9fa48("78") ? false : stryMutAct_9fa48("77") ? true : (stryCov_9fa48("77", "78", "79"), (stryMutAct_9fa48("81") ? typeof value === "number" || Number.isInteger(value) : stryMutAct_9fa48("80") ? true : (stryCov_9fa48("80", "81"), (stryMutAct_9fa48("83") ? typeof value !== "number" : stryMutAct_9fa48("82") ? true : (stryCov_9fa48("82", "83"), typeof value === (stryMutAct_9fa48("84") ? "" : (stryCov_9fa48("84"), "number")))) && Number.isInteger(value))) && (stryMutAct_9fa48("87") ? value < 0 : stryMutAct_9fa48("86") ? value > 0 : stryMutAct_9fa48("85") ? true : (stryCov_9fa48("85", "86", "87"), value >= 0)))) {
      if (stryMutAct_9fa48("88")) {
        {}
      } else {
        stryCov_9fa48("88");
        return value;
      }
    }
    if (stryMutAct_9fa48("91") ? typeof value !== "string" : stryMutAct_9fa48("90") ? false : stryMutAct_9fa48("89") ? true : (stryCov_9fa48("89", "90", "91"), typeof value === (stryMutAct_9fa48("92") ? "" : (stryCov_9fa48("92"), "string")))) {
      if (stryMutAct_9fa48("93")) {
        {}
      } else {
        stryCov_9fa48("93");
        const trimmed = stryMutAct_9fa48("94") ? value : (stryCov_9fa48("94"), value.trim());
        if (stryMutAct_9fa48("97") ? trimmed !== "" : stryMutAct_9fa48("96") ? false : stryMutAct_9fa48("95") ? true : (stryCov_9fa48("95", "96", "97"), trimmed === (stryMutAct_9fa48("98") ? "Stryker was here!" : (stryCov_9fa48("98"), "")))) {
          if (stryMutAct_9fa48("99")) {
            {}
          } else {
            stryCov_9fa48("99");
            return 0;
          }
        }
        const parsed = Number.parseInt(trimmed, 10);
        return (stryMutAct_9fa48("102") ? Number.isNaN(parsed) && parsed < 0 : stryMutAct_9fa48("101") ? false : stryMutAct_9fa48("100") ? true : (stryCov_9fa48("100", "101", "102"), Number.isNaN(parsed) || (stryMutAct_9fa48("105") ? parsed >= 0 : stryMutAct_9fa48("104") ? parsed <= 0 : stryMutAct_9fa48("103") ? false : (stryCov_9fa48("103", "104", "105"), parsed < 0)))) ? 0 : parsed;
      }
    }
    return 0;
  }
}
function normalizeTransaction(raw) {
  if (stryMutAct_9fa48("106")) {
    {}
  } else {
    stryCov_9fa48("106");
    if (stryMutAct_9fa48("109") ? !raw && typeof raw !== "object" : stryMutAct_9fa48("108") ? false : stryMutAct_9fa48("107") ? true : (stryCov_9fa48("107", "108", "109"), (stryMutAct_9fa48("110") ? raw : (stryCov_9fa48("110"), !raw)) || (stryMutAct_9fa48("112") ? typeof raw === "object" : stryMutAct_9fa48("111") ? false : (stryCov_9fa48("111", "112"), typeof raw !== (stryMutAct_9fa48("113") ? "" : (stryCov_9fa48("113"), "object")))))) {
      if (stryMutAct_9fa48("114")) {
        {}
      } else {
        stryCov_9fa48("114");
        return null;
      }
    }
    const date = (stryMutAct_9fa48("117") ? typeof raw.date !== "string" : stryMutAct_9fa48("116") ? false : stryMutAct_9fa48("115") ? true : (stryCov_9fa48("115", "116", "117"), typeof raw.date === (stryMutAct_9fa48("118") ? "" : (stryCov_9fa48("118"), "string")))) ? stryMutAct_9fa48("119") ? raw.date : (stryCov_9fa48("119"), raw.date.trim()) : stryMutAct_9fa48("120") ? "Stryker was here!" : (stryCov_9fa48("120"), "");
    if (stryMutAct_9fa48("123") ? false : stryMutAct_9fa48("122") ? true : stryMutAct_9fa48("121") ? date : (stryCov_9fa48("121", "122", "123"), !date)) {
      if (stryMutAct_9fa48("124")) {
        {}
      } else {
        stryCov_9fa48("124");
        return null;
      }
    }
    const type = stryMutAct_9fa48("125") ? String(raw.type ?? "").toLowerCase() : (stryCov_9fa48("125"), String(stryMutAct_9fa48("126") ? raw.type && "" : (stryCov_9fa48("126"), raw.type ?? (stryMutAct_9fa48("127") ? "Stryker was here!" : (stryCov_9fa48("127"), "")))).toUpperCase());
    const ticker = (stryMutAct_9fa48("130") ? typeof raw.ticker !== "string" : stryMutAct_9fa48("129") ? false : stryMutAct_9fa48("128") ? true : (stryCov_9fa48("128", "129", "130"), typeof raw.ticker === (stryMutAct_9fa48("131") ? "" : (stryCov_9fa48("131"), "string")))) ? stryMutAct_9fa48("133") ? raw.ticker.toUpperCase() : stryMutAct_9fa48("132") ? raw.ticker.trim().toLowerCase() : (stryCov_9fa48("132", "133"), raw.ticker.trim().toUpperCase()) : stryMutAct_9fa48("134") ? "Stryker was here!" : (stryCov_9fa48("134"), "");
    const shares = Math.abs(toFiniteNumber(raw.shares));
    const amount = toFiniteNumber(raw.amount);
    return stryMutAct_9fa48("135") ? {} : (stryCov_9fa48("135"), {
      date,
      type,
      ticker,
      shares,
      amount,
      createdAt: raw.createdAt,
      seq: raw.seq,
      id: raw.id,
      uid: raw.uid
    });
  }
}
function sortTransactions(transactions) {
  if (stryMutAct_9fa48("136")) {
    {}
  } else {
    stryCov_9fa48("136");
    return stryMutAct_9fa48("137") ? [...transactions] : (stryCov_9fa48("137"), (stryMutAct_9fa48("138") ? [] : (stryCov_9fa48("138"), [...transactions])).sort((a, b) => {
      if (stryMutAct_9fa48("139")) {
        {}
      } else {
        stryCov_9fa48("139");
        const dateDiff = a.date.localeCompare(b.date);
        if (stryMutAct_9fa48("142") ? dateDiff === 0 : stryMutAct_9fa48("141") ? false : stryMutAct_9fa48("140") ? true : (stryCov_9fa48("140", "141", "142"), dateDiff !== 0)) {
          if (stryMutAct_9fa48("143")) {
            {}
          } else {
            stryCov_9fa48("143");
            return dateDiff;
          }
        }
        const orderA = stryMutAct_9fa48("144") ? TYPE_ORDER[a.type] && 99 : (stryCov_9fa48("144"), TYPE_ORDER[a.type] ?? 99);
        const orderB = stryMutAct_9fa48("145") ? TYPE_ORDER[b.type] && 99 : (stryCov_9fa48("145"), TYPE_ORDER[b.type] ?? 99);
        if (stryMutAct_9fa48("148") ? orderA === orderB : stryMutAct_9fa48("147") ? false : stryMutAct_9fa48("146") ? true : (stryCov_9fa48("146", "147", "148"), orderA !== orderB)) {
          if (stryMutAct_9fa48("149")) {
            {}
          } else {
            stryCov_9fa48("149");
            return stryMutAct_9fa48("150") ? orderA + orderB : (stryCov_9fa48("150"), orderA - orderB);
          }
        }
        const createdDiff = stryMutAct_9fa48("151") ? toComparableTimestamp(a.createdAt) + toComparableTimestamp(b.createdAt) : (stryCov_9fa48("151"), toComparableTimestamp(a.createdAt) - toComparableTimestamp(b.createdAt));
        if (stryMutAct_9fa48("154") ? createdDiff === 0 : stryMutAct_9fa48("153") ? false : stryMutAct_9fa48("152") ? true : (stryCov_9fa48("152", "153", "154"), createdDiff !== 0)) {
          if (stryMutAct_9fa48("155")) {
            {}
          } else {
            stryCov_9fa48("155");
            return createdDiff;
          }
        }
        const seqDiff = stryMutAct_9fa48("156") ? toComparableSeq(a.seq) + toComparableSeq(b.seq) : (stryCov_9fa48("156"), toComparableSeq(a.seq) - toComparableSeq(b.seq));
        if (stryMutAct_9fa48("159") ? seqDiff === 0 : stryMutAct_9fa48("158") ? false : stryMutAct_9fa48("157") ? true : (stryCov_9fa48("157", "158", "159"), seqDiff !== 0)) {
          if (stryMutAct_9fa48("160")) {
            {}
          } else {
            stryCov_9fa48("160");
            return seqDiff;
          }
        }
        const idDiff = String(stryMutAct_9fa48("161") ? a.id && "" : (stryCov_9fa48("161"), a.id ?? (stryMutAct_9fa48("162") ? "Stryker was here!" : (stryCov_9fa48("162"), "")))).localeCompare(String(stryMutAct_9fa48("163") ? b.id && "" : (stryCov_9fa48("163"), b.id ?? (stryMutAct_9fa48("164") ? "Stryker was here!" : (stryCov_9fa48("164"), "")))));
        if (stryMutAct_9fa48("167") ? idDiff === 0 : stryMutAct_9fa48("166") ? false : stryMutAct_9fa48("165") ? true : (stryCov_9fa48("165", "166", "167"), idDiff !== 0)) {
          if (stryMutAct_9fa48("168")) {
            {}
          } else {
            stryCov_9fa48("168");
            return idDiff;
          }
        }
        return String(stryMutAct_9fa48("169") ? a.uid && "" : (stryCov_9fa48("169"), a.uid ?? (stryMutAct_9fa48("170") ? "Stryker was here!" : (stryCov_9fa48("170"), "")))).localeCompare(String(stryMutAct_9fa48("171") ? b.uid && "" : (stryCov_9fa48("171"), b.uid ?? (stryMutAct_9fa48("172") ? "Stryker was here!" : (stryCov_9fa48("172"), "")))));
      }
    }));
  }
}
function normalizePriceSeries(rawSeries) {
  if (stryMutAct_9fa48("173")) {
    {}
  } else {
    stryCov_9fa48("173");
    if (stryMutAct_9fa48("176") ? false : stryMutAct_9fa48("175") ? true : stryMutAct_9fa48("174") ? Array.isArray(rawSeries) : (stryCov_9fa48("174", "175", "176"), !Array.isArray(rawSeries))) {
      if (stryMutAct_9fa48("177")) {
        {}
      } else {
        stryCov_9fa48("177");
        return stryMutAct_9fa48("178") ? ["Stryker was here"] : (stryCov_9fa48("178"), []);
      }
    }
    const entries = stryMutAct_9fa48("179") ? ["Stryker was here"] : (stryCov_9fa48("179"), []);
    for (const point of rawSeries) {
      if (stryMutAct_9fa48("180")) {
        {}
      } else {
        stryCov_9fa48("180");
        const date = (stryMutAct_9fa48("183") ? typeof point?.date !== "string" : stryMutAct_9fa48("182") ? false : stryMutAct_9fa48("181") ? true : (stryCov_9fa48("181", "182", "183"), typeof (stryMutAct_9fa48("184") ? point.date : (stryCov_9fa48("184"), point?.date)) === (stryMutAct_9fa48("185") ? "" : (stryCov_9fa48("185"), "string")))) ? stryMutAct_9fa48("186") ? point.date : (stryCov_9fa48("186"), point.date.trim()) : stryMutAct_9fa48("187") ? "Stryker was here!" : (stryCov_9fa48("187"), "");
        if (stryMutAct_9fa48("190") ? false : stryMutAct_9fa48("189") ? true : stryMutAct_9fa48("188") ? date : (stryCov_9fa48("188", "189", "190"), !date)) {
          if (stryMutAct_9fa48("191")) {
            {}
          } else {
            stryCov_9fa48("191");
            continue;
          }
        }
        const close = Number(stryMutAct_9fa48("192") ? (point?.close ?? point?.price) && 0 : (stryCov_9fa48("192"), (stryMutAct_9fa48("193") ? point?.close && point?.price : (stryCov_9fa48("193"), (stryMutAct_9fa48("194") ? point.close : (stryCov_9fa48("194"), point?.close)) ?? (stryMutAct_9fa48("195") ? point.price : (stryCov_9fa48("195"), point?.price)))) ?? 0));
        const safeClose = Number.isFinite(close) ? close : 0;
        entries.push(stryMutAct_9fa48("196") ? {} : (stryCov_9fa48("196"), {
          date,
          close: safeClose
        }));
      }
    }
    stryMutAct_9fa48("197") ? entries : (stryCov_9fa48("197"), entries.sort(stryMutAct_9fa48("198") ? () => undefined : (stryCov_9fa48("198"), (a, b) => a.date.localeCompare(b.date))));
    const deduped = stryMutAct_9fa48("199") ? ["Stryker was here"] : (stryCov_9fa48("199"), []);
    for (const entry of entries) {
      if (stryMutAct_9fa48("200")) {
        {}
      } else {
        stryCov_9fa48("200");
        const last = deduped[stryMutAct_9fa48("201") ? deduped.length + 1 : (stryCov_9fa48("201"), deduped.length - 1)];
        if (stryMutAct_9fa48("204") ? last || last.date === entry.date : stryMutAct_9fa48("203") ? false : stryMutAct_9fa48("202") ? true : (stryCov_9fa48("202", "203", "204"), last && (stryMutAct_9fa48("206") ? last.date !== entry.date : stryMutAct_9fa48("205") ? true : (stryCov_9fa48("205", "206"), last.date === entry.date)))) {
          if (stryMutAct_9fa48("207")) {
            {}
          } else {
            stryCov_9fa48("207");
            deduped[stryMutAct_9fa48("208") ? deduped.length + 1 : (stryCov_9fa48("208"), deduped.length - 1)] = entry;
          }
        } else {
          if (stryMutAct_9fa48("209")) {
            {}
          } else {
            stryCov_9fa48("209");
            deduped.push(entry);
          }
        }
      }
    }
    return deduped;
  }
}
function createPriceCursor(rawSeries) {
  if (stryMutAct_9fa48("210")) {
    {}
  } else {
    stryCov_9fa48("210");
    const series = normalizePriceSeries(rawSeries);
    let index = 0;
    let lastPrice = 0;
    return stryMutAct_9fa48("211") ? {} : (stryCov_9fa48("211"), {
      advanceTo(date) {
        if (stryMutAct_9fa48("212")) {
          {}
        } else {
          stryCov_9fa48("212");
          while (stryMutAct_9fa48("214") ? index < series.length || series[index].date <= date : stryMutAct_9fa48("213") ? false : (stryCov_9fa48("213", "214"), (stryMutAct_9fa48("217") ? index >= series.length : stryMutAct_9fa48("216") ? index <= series.length : stryMutAct_9fa48("215") ? true : (stryCov_9fa48("215", "216", "217"), index < series.length)) && (stryMutAct_9fa48("220") ? series[index].date > date : stryMutAct_9fa48("219") ? series[index].date < date : stryMutAct_9fa48("218") ? true : (stryCov_9fa48("218", "219", "220"), series[index].date <= date)))) {
            if (stryMutAct_9fa48("221")) {
              {}
            } else {
              stryCov_9fa48("221");
              const candidate = Number(series[index].close);
              if (stryMutAct_9fa48("223") ? false : stryMutAct_9fa48("222") ? true : (stryCov_9fa48("222", "223"), Number.isFinite(candidate))) {
                if (stryMutAct_9fa48("224")) {
                  {}
                } else {
                  stryCov_9fa48("224");
                  lastPrice = candidate;
                }
              }
              stryMutAct_9fa48("225") ? index -= 1 : (stryCov_9fa48("225"), index += 1);
            }
          }
          return lastPrice;
        }
      },
      peek() {
        if (stryMutAct_9fa48("226")) {
          {}
        } else {
          stryCov_9fa48("226");
          return lastPrice;
        }
      }
    });
  }
}
function roundPercentage(value) {
  if (stryMutAct_9fa48("227")) {
    {}
  } else {
    stryCov_9fa48("227");
    if (stryMutAct_9fa48("230") ? false : stryMutAct_9fa48("229") ? true : stryMutAct_9fa48("228") ? Number.isFinite(value) : (stryCov_9fa48("228", "229", "230"), !Number.isFinite(value))) {
      if (stryMutAct_9fa48("231")) {
        {}
      } else {
        stryCov_9fa48("231");
        return 0;
      }
    }
    return Number(value.toFixed(3));
  }
}
function toNumeric(value) {
  if (stryMutAct_9fa48("232")) {
    {}
  } else {
    stryCov_9fa48("232");
    const number = Number(value);
    if (stryMutAct_9fa48("235") ? false : stryMutAct_9fa48("234") ? true : stryMutAct_9fa48("233") ? Number.isFinite(number) : (stryCov_9fa48("233", "234", "235"), !Number.isFinite(number))) {
      if (stryMutAct_9fa48("236")) {
        {}
      } else {
        stryCov_9fa48("236");
        return 0;
      }
    }
    return stryMutAct_9fa48("237") ? Math.round((number + Number.EPSILON) * 10_000) * 10_000 : (stryCov_9fa48("237"), Math.round(stryMutAct_9fa48("238") ? (number + Number.EPSILON) / 10_000 : (stryCov_9fa48("238"), (stryMutAct_9fa48("239") ? number - Number.EPSILON : (stryCov_9fa48("239"), number + Number.EPSILON)) * 10_000)) / 10_000);
  }
}
export function mergeReturnSeries(series = {}) {
  if (stryMutAct_9fa48("240")) {
    {}
  } else {
    stryCov_9fa48("240");
    const entriesByDate = new Map();
    for (const [targetKey, sourceKey] of Object.entries(SERIES_SOURCE_KEYS)) {
      if (stryMutAct_9fa48("241")) {
        {}
      } else {
        stryCov_9fa48("241");
        const sourceSeries = Array.isArray(stryMutAct_9fa48("242") ? series[sourceKey] : (stryCov_9fa48("242"), series?.[sourceKey])) ? series[sourceKey] : stryMutAct_9fa48("243") ? ["Stryker was here"] : (stryCov_9fa48("243"), []);
        for (const point of sourceSeries) {
          if (stryMutAct_9fa48("244")) {
            {}
          } else {
            stryCov_9fa48("244");
            const date = stryMutAct_9fa48("245") ? point.date : (stryCov_9fa48("245"), point?.date);
            if (stryMutAct_9fa48("248") ? false : stryMutAct_9fa48("247") ? true : stryMutAct_9fa48("246") ? date : (stryCov_9fa48("246", "247", "248"), !date)) {
              if (stryMutAct_9fa48("249")) {
                {}
              } else {
                stryCov_9fa48("249");
                continue;
              }
            }
            const normalized = stryMutAct_9fa48("250") ? entriesByDate.get(date) && {
              date
            } : (stryCov_9fa48("250"), entriesByDate.get(date) ?? (stryMutAct_9fa48("251") ? {} : (stryCov_9fa48("251"), {
              date
            })));
            normalized[targetKey] = toNumeric(stryMutAct_9fa48("252") ? point.value : (stryCov_9fa48("252"), point?.value));
            entriesByDate.set(date, normalized);
          }
        }
      }
    }
    const sortedDates = stryMutAct_9fa48("253") ? Array.from(entriesByDate.keys()) : (stryCov_9fa48("253"), Array.from(entriesByDate.keys()).sort(stryMutAct_9fa48("254") ? () => undefined : (stryCov_9fa48("254"), (a, b) => String(a).localeCompare(String(b)))));
    return sortedDates.map(date => {
      if (stryMutAct_9fa48("255")) {
        {}
      } else {
        stryCov_9fa48("255");
        const entry = stryMutAct_9fa48("256") ? entriesByDate.get(date) && {
          date
        } : (stryCov_9fa48("256"), entriesByDate.get(date) ?? (stryMutAct_9fa48("257") ? {} : (stryCov_9fa48("257"), {
          date
        })));
        return stryMutAct_9fa48("258") ? {} : (stryCov_9fa48("258"), {
          date,
          portfolio: toNumeric(entry.portfolio),
          spy: toNumeric(entry.spy),
          blended: toNumeric(entry.blended),
          exCash: toNumeric(entry.exCash),
          cash: toNumeric(entry.cash)
        });
      }
    });
  }
}
export async function buildRoiSeries(transactions, priceFetcher) {
  if (stryMutAct_9fa48("259")) {
    {}
  } else {
    stryCov_9fa48("259");
    if (stryMutAct_9fa48("262") ? !Array.isArray(transactions) && transactions.length === 0 : stryMutAct_9fa48("261") ? false : stryMutAct_9fa48("260") ? true : (stryCov_9fa48("260", "261", "262"), (stryMutAct_9fa48("263") ? Array.isArray(transactions) : (stryCov_9fa48("263"), !Array.isArray(transactions))) || (stryMutAct_9fa48("265") ? transactions.length !== 0 : stryMutAct_9fa48("264") ? false : (stryCov_9fa48("264", "265"), transactions.length === 0)))) {
      if (stryMutAct_9fa48("266")) {
        {}
      } else {
        stryCov_9fa48("266");
        return stryMutAct_9fa48("267") ? ["Stryker was here"] : (stryCov_9fa48("267"), []);
      }
    }
    const normalizedTransactions = stryMutAct_9fa48("268") ? transactions.map(tx => normalizeTransaction(tx)) : (stryCov_9fa48("268"), transactions.map(stryMutAct_9fa48("269") ? () => undefined : (stryCov_9fa48("269"), tx => normalizeTransaction(tx))).filter(Boolean));
    if (stryMutAct_9fa48("272") ? normalizedTransactions.length !== 0 : stryMutAct_9fa48("271") ? false : stryMutAct_9fa48("270") ? true : (stryCov_9fa48("270", "271", "272"), normalizedTransactions.length === 0)) {
      if (stryMutAct_9fa48("273")) {
        {}
      } else {
        stryCov_9fa48("273");
        return stryMutAct_9fa48("274") ? ["Stryker was here"] : (stryCov_9fa48("274"), []);
      }
    }
    const tickers = stryMutAct_9fa48("275") ? [] : (stryCov_9fa48("275"), [...new Set(stryMutAct_9fa48("276") ? normalizedTransactions.map(tx => tx.ticker) : (stryCov_9fa48("276"), normalizedTransactions.filter(stryMutAct_9fa48("277") ? () => undefined : (stryCov_9fa48("277"), tx => stryMutAct_9fa48("280") ? tx.ticker || SHARE_TYPES.has(tx.type) : stryMutAct_9fa48("279") ? false : stryMutAct_9fa48("278") ? true : (stryCov_9fa48("278", "279", "280"), tx.ticker && SHARE_TYPES.has(tx.type)))).map(stryMutAct_9fa48("281") ? () => undefined : (stryCov_9fa48("281"), tx => tx.ticker))))]);
    const symbols = stryMutAct_9fa48("282") ? [] : (stryCov_9fa48("282"), [...tickers, stryMutAct_9fa48("283") ? "" : (stryCov_9fa48("283"), "spy")]);
    if (stryMutAct_9fa48("286") ? priceFetcher || typeof priceFetcher.prefetch === "function" : stryMutAct_9fa48("285") ? false : stryMutAct_9fa48("284") ? true : (stryCov_9fa48("284", "285", "286"), priceFetcher && (stryMutAct_9fa48("288") ? typeof priceFetcher.prefetch !== "function" : stryMutAct_9fa48("287") ? true : (stryCov_9fa48("287", "288"), typeof priceFetcher.prefetch === (stryMutAct_9fa48("289") ? "" : (stryCov_9fa48("289"), "function")))))) {
      if (stryMutAct_9fa48("290")) {
        {}
      } else {
        stryCov_9fa48("290");
        try {
          if (stryMutAct_9fa48("291")) {
            {}
          } else {
            stryCov_9fa48("291");
            await priceFetcher.prefetch(symbols);
          }
        } catch (error) {
          if (stryMutAct_9fa48("292")) {
            {}
          } else {
            stryCov_9fa48("292");
            console.error(stryMutAct_9fa48("293") ? "" : (stryCov_9fa48("293"), "Failed to prefetch price series"), error);
          }
        }
      }
    }
    const priceMapEntries = await Promise.all(symbols.map(async symbol => {
      if (stryMutAct_9fa48("294")) {
        {}
      } else {
        stryCov_9fa48("294");
        try {
          if (stryMutAct_9fa48("295")) {
            {}
          } else {
            stryCov_9fa48("295");
            const result = await priceFetcher(symbol);
            if (stryMutAct_9fa48("297") ? false : stryMutAct_9fa48("296") ? true : (stryCov_9fa48("296", "297"), Array.isArray(result))) {
              if (stryMutAct_9fa48("298")) {
                {}
              } else {
                stryCov_9fa48("298");
                return stryMutAct_9fa48("299") ? [] : (stryCov_9fa48("299"), [stryMutAct_9fa48("300") ? symbol.toLowerCase() : (stryCov_9fa48("300"), symbol.toUpperCase()), result]);
              }
            }
            if (stryMutAct_9fa48("303") ? result || Array.isArray(result.data) : stryMutAct_9fa48("302") ? false : stryMutAct_9fa48("301") ? true : (stryCov_9fa48("301", "302", "303"), result && Array.isArray(result.data))) {
              if (stryMutAct_9fa48("304")) {
                {}
              } else {
                stryCov_9fa48("304");
                return stryMutAct_9fa48("305") ? [] : (stryCov_9fa48("305"), [stryMutAct_9fa48("306") ? symbol.toLowerCase() : (stryCov_9fa48("306"), symbol.toUpperCase()), result.data]);
              }
            }
            return stryMutAct_9fa48("307") ? [] : (stryCov_9fa48("307"), [stryMutAct_9fa48("308") ? symbol.toLowerCase() : (stryCov_9fa48("308"), symbol.toUpperCase()), stryMutAct_9fa48("309") ? ["Stryker was here"] : (stryCov_9fa48("309"), [])]);
          }
        } catch (error) {
          if (stryMutAct_9fa48("310")) {
            {}
          } else {
            stryCov_9fa48("310");
            console.error(error);
            return stryMutAct_9fa48("311") ? [] : (stryCov_9fa48("311"), [stryMutAct_9fa48("312") ? symbol.toLowerCase() : (stryCov_9fa48("312"), symbol.toUpperCase()), stryMutAct_9fa48("313") ? ["Stryker was here"] : (stryCov_9fa48("313"), [])]);
          }
        }
      }
    }));
    const priceMap = new Map(priceMapEntries.map(stryMutAct_9fa48("314") ? () => undefined : (stryCov_9fa48("314"), ([symbol, series]) => stryMutAct_9fa48("315") ? [] : (stryCov_9fa48("315"), [symbol, normalizePriceSeries(series)]))));
    const spySeries = stryMutAct_9fa48("316") ? (priceMap.get("SPY") ?? priceMap.get("spy")) && [] : (stryCov_9fa48("316"), (stryMutAct_9fa48("317") ? priceMap.get("SPY") && priceMap.get("spy") : (stryCov_9fa48("317"), priceMap.get(stryMutAct_9fa48("318") ? "" : (stryCov_9fa48("318"), "SPY")) ?? priceMap.get(stryMutAct_9fa48("319") ? "" : (stryCov_9fa48("319"), "spy")))) ?? (stryMutAct_9fa48("320") ? ["Stryker was here"] : (stryCov_9fa48("320"), [])));
    if (stryMutAct_9fa48("323") ? spySeries.length !== 0 : stryMutAct_9fa48("322") ? false : stryMutAct_9fa48("321") ? true : (stryCov_9fa48("321", "322", "323"), spySeries.length === 0)) {
      if (stryMutAct_9fa48("324")) {
        {}
      } else {
        stryCov_9fa48("324");
        return stryMutAct_9fa48("325") ? ["Stryker was here"] : (stryCov_9fa48("325"), []);
      }
    }
    const sortedTransactions = sortTransactions(normalizedTransactions);
    const priceCursors = new Map();
    for (const ticker of tickers) {
      if (stryMutAct_9fa48("326")) {
        {}
      } else {
        stryCov_9fa48("326");
        priceCursors.set(ticker, createPriceCursor(stryMutAct_9fa48("327") ? priceMap.get(ticker) && [] : (stryCov_9fa48("327"), priceMap.get(ticker) ?? (stryMutAct_9fa48("328") ? ["Stryker was here"] : (stryCov_9fa48("328"), [])))));
      }
    }
    const holdings = new Map();
    for (const ticker of tickers) {
      if (stryMutAct_9fa48("329")) {
        {}
      } else {
        stryCov_9fa48("329");
        holdings.set(ticker, 0);
      }
    }
    const activeTickers = new Set();
    let cashBalance = 0;
    let transactionIndex = 0;
    let previousNav = null;
    let cumulativeFactor = 1;
    let initialSpyPrice = null;
    const results = stryMutAct_9fa48("330") ? ["Stryker was here"] : (stryCov_9fa48("330"), []);
    for (const point of spySeries) {
      if (stryMutAct_9fa48("331")) {
        {}
      } else {
        stryCov_9fa48("331");
        const date = point.date;
        let flowForDate = 0;
        while (stryMutAct_9fa48("333") ? transactionIndex < sortedTransactions.length || sortedTransactions[transactionIndex].date <= date : stryMutAct_9fa48("332") ? false : (stryCov_9fa48("332", "333"), (stryMutAct_9fa48("336") ? transactionIndex >= sortedTransactions.length : stryMutAct_9fa48("335") ? transactionIndex <= sortedTransactions.length : stryMutAct_9fa48("334") ? true : (stryCov_9fa48("334", "335", "336"), transactionIndex < sortedTransactions.length)) && (stryMutAct_9fa48("339") ? sortedTransactions[transactionIndex].date > date : stryMutAct_9fa48("338") ? sortedTransactions[transactionIndex].date < date : stryMutAct_9fa48("337") ? true : (stryCov_9fa48("337", "338", "339"), sortedTransactions[transactionIndex].date <= date)))) {
          if (stryMutAct_9fa48("340")) {
            {}
          } else {
            stryCov_9fa48("340");
            const tx = sortedTransactions[transactionIndex];
            stryMutAct_9fa48("341") ? transactionIndex -= 1 : (stryCov_9fa48("341"), transactionIndex += 1);
            const amount = Number.isFinite(tx.amount) ? tx.amount : 0;
            if (stryMutAct_9fa48("344") ? SHARE_TYPES.has(tx.type) || tx.ticker : stryMutAct_9fa48("343") ? false : stryMutAct_9fa48("342") ? true : (stryCov_9fa48("342", "343", "344"), SHARE_TYPES.has(tx.type) && tx.ticker)) {
              if (stryMutAct_9fa48("345")) {
                {}
              } else {
                stryCov_9fa48("345");
                const previousShares = stryMutAct_9fa48("346") ? holdings.get(tx.ticker) && 0 : (stryCov_9fa48("346"), holdings.get(tx.ticker) ?? 0);
                const sharesDelta = (stryMutAct_9fa48("349") ? tx.type !== "BUY" : stryMutAct_9fa48("348") ? false : stryMutAct_9fa48("347") ? true : (stryCov_9fa48("347", "348", "349"), tx.type === (stryMutAct_9fa48("350") ? "" : (stryCov_9fa48("350"), "BUY")))) ? tx.shares : stryMutAct_9fa48("351") ? +tx.shares : (stryCov_9fa48("351"), -tx.shares);
                const rawNextShares = stryMutAct_9fa48("352") ? previousShares - sharesDelta : (stryCov_9fa48("352"), previousShares + sharesDelta);
                const nextShares = (stryMutAct_9fa48("356") ? Math.abs(rawNextShares) >= SHARE_EPSILON : stryMutAct_9fa48("355") ? Math.abs(rawNextShares) <= SHARE_EPSILON : stryMutAct_9fa48("354") ? false : stryMutAct_9fa48("353") ? true : (stryCov_9fa48("353", "354", "355", "356"), Math.abs(rawNextShares) < SHARE_EPSILON)) ? 0 : rawNextShares;
                holdings.set(tx.ticker, nextShares);
                if (stryMutAct_9fa48("360") ? Math.abs(nextShares) >= SHARE_EPSILON : stryMutAct_9fa48("359") ? Math.abs(nextShares) <= SHARE_EPSILON : stryMutAct_9fa48("358") ? false : stryMutAct_9fa48("357") ? true : (stryCov_9fa48("357", "358", "359", "360"), Math.abs(nextShares) < SHARE_EPSILON)) {
                  if (stryMutAct_9fa48("361")) {
                    {}
                  } else {
                    stryCov_9fa48("361");
                    activeTickers.delete(tx.ticker);
                  }
                } else {
                  if (stryMutAct_9fa48("362")) {
                    {}
                  } else {
                    stryCov_9fa48("362");
                    activeTickers.add(tx.ticker);
                  }
                }
                const tradeCash = Math.abs(amount);
                if (stryMutAct_9fa48("365") ? tx.type !== "BUY" : stryMutAct_9fa48("364") ? false : stryMutAct_9fa48("363") ? true : (stryCov_9fa48("363", "364", "365"), tx.type === (stryMutAct_9fa48("366") ? "" : (stryCov_9fa48("366"), "BUY")))) {
                  if (stryMutAct_9fa48("367")) {
                    {}
                  } else {
                    stryCov_9fa48("367");
                    if (stryMutAct_9fa48("371") ? tradeCash <= 0 : stryMutAct_9fa48("370") ? tradeCash >= 0 : stryMutAct_9fa48("369") ? false : stryMutAct_9fa48("368") ? true : (stryCov_9fa48("368", "369", "370", "371"), tradeCash > 0)) {
                      if (stryMutAct_9fa48("372")) {
                        {}
                      } else {
                        stryCov_9fa48("372");
                        stryMutAct_9fa48("373") ? cashBalance += tradeCash : (stryCov_9fa48("373"), cashBalance -= tradeCash);
                      }
                    }
                    if (stryMutAct_9fa48("377") ? cashBalance >= 0 : stryMutAct_9fa48("376") ? cashBalance <= 0 : stryMutAct_9fa48("375") ? false : stryMutAct_9fa48("374") ? true : (stryCov_9fa48("374", "375", "376", "377"), cashBalance < 0)) {
                      if (stryMutAct_9fa48("378")) {
                        {}
                      } else {
                        stryCov_9fa48("378");
                        cashBalance = 0;
                      }
                    }
                  }
                } else if (stryMutAct_9fa48("381") ? tx.type === "SELL" || tradeCash > 0 : stryMutAct_9fa48("380") ? false : stryMutAct_9fa48("379") ? true : (stryCov_9fa48("379", "380", "381"), (stryMutAct_9fa48("383") ? tx.type !== "SELL" : stryMutAct_9fa48("382") ? true : (stryCov_9fa48("382", "383"), tx.type === (stryMutAct_9fa48("384") ? "" : (stryCov_9fa48("384"), "SELL")))) && (stryMutAct_9fa48("387") ? tradeCash <= 0 : stryMutAct_9fa48("386") ? tradeCash >= 0 : stryMutAct_9fa48("385") ? true : (stryCov_9fa48("385", "386", "387"), tradeCash > 0)))) {
                  if (stryMutAct_9fa48("388")) {
                    {}
                  } else {
                    stryCov_9fa48("388");
                    stryMutAct_9fa48("389") ? cashBalance -= tradeCash : (stryCov_9fa48("389"), cashBalance += tradeCash);
                  }
                }
                continue;
              }
            }
            if (stryMutAct_9fa48("391") ? false : stryMutAct_9fa48("390") ? true : (stryCov_9fa48("390", "391"), CASH_IN_TYPES.has(tx.type))) {
              if (stryMutAct_9fa48("392")) {
                {}
              } else {
                stryCov_9fa48("392");
                const contribution = Math.abs(amount);
                if (stryMutAct_9fa48("396") ? contribution <= 0 : stryMutAct_9fa48("395") ? contribution >= 0 : stryMutAct_9fa48("394") ? false : stryMutAct_9fa48("393") ? true : (stryCov_9fa48("393", "394", "395", "396"), contribution > 0)) {
                  if (stryMutAct_9fa48("397")) {
                    {}
                  } else {
                    stryCov_9fa48("397");
                    stryMutAct_9fa48("398") ? cashBalance -= contribution : (stryCov_9fa48("398"), cashBalance += contribution);
                    stryMutAct_9fa48("399") ? flowForDate -= contribution : (stryCov_9fa48("399"), flowForDate += contribution);
                  }
                }
                continue;
              }
            }
            if (stryMutAct_9fa48("401") ? false : stryMutAct_9fa48("400") ? true : (stryCov_9fa48("400", "401"), CASH_OUT_TYPES.has(tx.type))) {
              if (stryMutAct_9fa48("402")) {
                {}
              } else {
                stryCov_9fa48("402");
                const withdrawal = Math.abs(amount);
                if (stryMutAct_9fa48("406") ? withdrawal <= 0 : stryMutAct_9fa48("405") ? withdrawal >= 0 : stryMutAct_9fa48("404") ? false : stryMutAct_9fa48("403") ? true : (stryCov_9fa48("403", "404", "405", "406"), withdrawal > 0)) {
                  if (stryMutAct_9fa48("407")) {
                    {}
                  } else {
                    stryCov_9fa48("407");
                    stryMutAct_9fa48("408") ? cashBalance += withdrawal : (stryCov_9fa48("408"), cashBalance -= withdrawal);
                    stryMutAct_9fa48("409") ? flowForDate += withdrawal : (stryCov_9fa48("409"), flowForDate -= withdrawal);
                  }
                }
                if (stryMutAct_9fa48("413") ? cashBalance >= 0 : stryMutAct_9fa48("412") ? cashBalance <= 0 : stryMutAct_9fa48("411") ? false : stryMutAct_9fa48("410") ? true : (stryCov_9fa48("410", "411", "412", "413"), cashBalance < 0)) {
                  if (stryMutAct_9fa48("414")) {
                    {}
                  } else {
                    stryCov_9fa48("414");
                    cashBalance = 0;
                  }
                }
                continue;
              }
            }
            if (stryMutAct_9fa48("416") ? false : stryMutAct_9fa48("415") ? true : (stryCov_9fa48("415", "416"), INCOME_TYPES.has(tx.type))) {
              if (stryMutAct_9fa48("417")) {
                {}
              } else {
                stryCov_9fa48("417");
                if (stryMutAct_9fa48("420") ? amount === 0 : stryMutAct_9fa48("419") ? false : stryMutAct_9fa48("418") ? true : (stryCov_9fa48("418", "419", "420"), amount !== 0)) {
                  if (stryMutAct_9fa48("421")) {
                    {}
                  } else {
                    stryCov_9fa48("421");
                    stryMutAct_9fa48("422") ? cashBalance -= amount : (stryCov_9fa48("422"), cashBalance += amount);
                  }
                }
                continue;
              }
            }
            if (stryMutAct_9fa48("425") ? amount === 0 : stryMutAct_9fa48("424") ? false : stryMutAct_9fa48("423") ? true : (stryCov_9fa48("423", "424", "425"), amount !== 0)) {
              if (stryMutAct_9fa48("426")) {
                {}
              } else {
                stryCov_9fa48("426");
                stryMutAct_9fa48("427") ? cashBalance -= amount : (stryCov_9fa48("427"), cashBalance += amount);
              }
            }
          }
        }
        let portfolioValue = cashBalance;
        for (const ticker of activeTickers) {
          if (stryMutAct_9fa48("428")) {
            {}
          } else {
            stryCov_9fa48("428");
            const shares = holdings.get(ticker);
            if (stryMutAct_9fa48("431") ? !Number.isFinite(shares) && Math.abs(shares) < SHARE_EPSILON : stryMutAct_9fa48("430") ? false : stryMutAct_9fa48("429") ? true : (stryCov_9fa48("429", "430", "431"), (stryMutAct_9fa48("432") ? Number.isFinite(shares) : (stryCov_9fa48("432"), !Number.isFinite(shares))) || (stryMutAct_9fa48("435") ? Math.abs(shares) >= SHARE_EPSILON : stryMutAct_9fa48("434") ? Math.abs(shares) <= SHARE_EPSILON : stryMutAct_9fa48("433") ? false : (stryCov_9fa48("433", "434", "435"), Math.abs(shares) < SHARE_EPSILON)))) {
              if (stryMutAct_9fa48("436")) {
                {}
              } else {
                stryCov_9fa48("436");
                continue;
              }
            }
            const cursor = priceCursors.get(ticker);
            const price = cursor ? cursor.advanceTo(date) : 0;
            stryMutAct_9fa48("437") ? portfolioValue -= shares * price : (stryCov_9fa48("437"), portfolioValue += stryMutAct_9fa48("438") ? shares / price : (stryCov_9fa48("438"), shares * price));
          }
        }
        if (stryMutAct_9fa48("442") ? Math.abs(portfolioValue) >= SHARE_EPSILON : stryMutAct_9fa48("441") ? Math.abs(portfolioValue) <= SHARE_EPSILON : stryMutAct_9fa48("440") ? false : stryMutAct_9fa48("439") ? true : (stryCov_9fa48("439", "440", "441", "442"), Math.abs(portfolioValue) < SHARE_EPSILON)) {
          if (stryMutAct_9fa48("443")) {
            {}
          } else {
            stryCov_9fa48("443");
            portfolioValue = 0;
          }
        }
        let periodReturn = 0;
        if (stryMutAct_9fa48("446") ? previousNav !== null || previousNav > 0 : stryMutAct_9fa48("445") ? false : stryMutAct_9fa48("444") ? true : (stryCov_9fa48("444", "445", "446"), (stryMutAct_9fa48("448") ? previousNav === null : stryMutAct_9fa48("447") ? true : (stryCov_9fa48("447", "448"), previousNav !== null)) && (stryMutAct_9fa48("451") ? previousNav <= 0 : stryMutAct_9fa48("450") ? previousNav >= 0 : stryMutAct_9fa48("449") ? true : (stryCov_9fa48("449", "450", "451"), previousNav > 0)))) {
          if (stryMutAct_9fa48("452")) {
            {}
          } else {
            stryCov_9fa48("452");
            periodReturn = stryMutAct_9fa48("453") ? (portfolioValue - flowForDate - previousNav) * previousNav : (stryCov_9fa48("453"), (stryMutAct_9fa48("454") ? portfolioValue - flowForDate + previousNav : (stryCov_9fa48("454"), (stryMutAct_9fa48("455") ? portfolioValue + flowForDate : (stryCov_9fa48("455"), portfolioValue - flowForDate)) - previousNav)) / previousNav);
          }
        }
        if (stryMutAct_9fa48("458") ? false : stryMutAct_9fa48("457") ? true : stryMutAct_9fa48("456") ? Number.isFinite(periodReturn) : (stryCov_9fa48("456", "457", "458"), !Number.isFinite(periodReturn))) {
          if (stryMutAct_9fa48("459")) {
            {}
          } else {
            stryCov_9fa48("459");
            periodReturn = 0;
          }
        }
        stryMutAct_9fa48("460") ? cumulativeFactor /= 1 + periodReturn : (stryCov_9fa48("460"), cumulativeFactor *= stryMutAct_9fa48("461") ? 1 - periodReturn : (stryCov_9fa48("461"), 1 + periodReturn));
        if (stryMutAct_9fa48("464") ? !Number.isFinite(cumulativeFactor) && cumulativeFactor <= 0 : stryMutAct_9fa48("463") ? false : stryMutAct_9fa48("462") ? true : (stryCov_9fa48("462", "463", "464"), (stryMutAct_9fa48("465") ? Number.isFinite(cumulativeFactor) : (stryCov_9fa48("465"), !Number.isFinite(cumulativeFactor))) || (stryMutAct_9fa48("468") ? cumulativeFactor > 0 : stryMutAct_9fa48("467") ? cumulativeFactor < 0 : stryMutAct_9fa48("466") ? false : (stryCov_9fa48("466", "467", "468"), cumulativeFactor <= 0)))) {
          if (stryMutAct_9fa48("469")) {
            {}
          } else {
            stryCov_9fa48("469");
            cumulativeFactor = 1;
          }
        }
        if (stryMutAct_9fa48("472") ? previousNav === null || portfolioValue > 0 : stryMutAct_9fa48("471") ? false : stryMutAct_9fa48("470") ? true : (stryCov_9fa48("470", "471", "472"), (stryMutAct_9fa48("474") ? previousNav !== null : stryMutAct_9fa48("473") ? true : (stryCov_9fa48("473", "474"), previousNav === null)) && (stryMutAct_9fa48("477") ? portfolioValue <= 0 : stryMutAct_9fa48("476") ? portfolioValue >= 0 : stryMutAct_9fa48("475") ? true : (stryCov_9fa48("475", "476", "477"), portfolioValue > 0)))) {
          if (stryMutAct_9fa48("478")) {
            {}
          } else {
            stryCov_9fa48("478");
            cumulativeFactor = 1;
          }
        }
        const spyClose = Number.isFinite(point.close) ? Number(point.close) : 0;
        if (stryMutAct_9fa48("481") ? initialSpyPrice === null || spyClose > 0 : stryMutAct_9fa48("480") ? false : stryMutAct_9fa48("479") ? true : (stryCov_9fa48("479", "480", "481"), (stryMutAct_9fa48("483") ? initialSpyPrice !== null : stryMutAct_9fa48("482") ? true : (stryCov_9fa48("482", "483"), initialSpyPrice === null)) && (stryMutAct_9fa48("486") ? spyClose <= 0 : stryMutAct_9fa48("485") ? spyClose >= 0 : stryMutAct_9fa48("484") ? true : (stryCov_9fa48("484", "485", "486"), spyClose > 0)))) {
          if (stryMutAct_9fa48("487")) {
            {}
          } else {
            stryCov_9fa48("487");
            initialSpyPrice = spyClose;
          }
        }
        const spyBaseline = stryMutAct_9fa48("488") ? initialSpyPrice && spyClose : (stryCov_9fa48("488"), initialSpyPrice ?? spyClose);
        const spyReturn = (stryMutAct_9fa48("491") ? spyBaseline || spyBaseline !== 0 : stryMutAct_9fa48("490") ? false : stryMutAct_9fa48("489") ? true : (stryCov_9fa48("489", "490", "491"), spyBaseline && (stryMutAct_9fa48("493") ? spyBaseline === 0 : stryMutAct_9fa48("492") ? true : (stryCov_9fa48("492", "493"), spyBaseline !== 0)))) ? stryMutAct_9fa48("494") ? (spyClose - spyBaseline) / spyBaseline / 100 : (stryCov_9fa48("494"), (stryMutAct_9fa48("495") ? (spyClose - spyBaseline) * spyBaseline : (stryCov_9fa48("495"), (stryMutAct_9fa48("496") ? spyClose + spyBaseline : (stryCov_9fa48("496"), spyClose - spyBaseline)) / spyBaseline)) * 100) : 0;
        results.push(stryMutAct_9fa48("497") ? {} : (stryCov_9fa48("497"), {
          date,
          portfolio: roundPercentage(stryMutAct_9fa48("498") ? (cumulativeFactor - 1) / 100 : (stryCov_9fa48("498"), (stryMutAct_9fa48("499") ? cumulativeFactor + 1 : (stryCov_9fa48("499"), cumulativeFactor - 1)) * 100)),
          spy: roundPercentage(spyReturn)
        }));
        previousNav = portfolioValue;
      }
    }
    return results;
  }
}