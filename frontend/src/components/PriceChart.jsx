import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  createChart,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
} from 'lightweight-charts';

/* ───────── colour palette ───────── */
const C = {
  bg:         '#07080d',
  grid:       'rgba(255,255,255,0.04)',
  border:     'rgba(255,255,255,0.06)',
  text:       '#64748b',
  crosshair:  '#38bdf8',
  upBody:     '#4ade80',
  downBody:   '#f87171',
  upWick:     '#4ade80',
  downWick:   '#f87171',
  line:       '#38bdf8',
  sma20:      '#4ade80',
  sma50:      '#fbbf24',
  bbMid:      '#c084fc',
  bbBand:     'rgba(192,132,252,0.25)',
  buyMarker:  '#4ade80',
  sellMarker: '#f87171',
  priceLine:  '#38bdf8',
};

/* ───────── helpers ───────── */

/** Convert backend Datetime string -> epoch seconds */
function toEpoch(dt) {
  if (!dt) return 0;
  return Math.floor(new Date(dt).getTime() / 1000);
}

/** Build OHLC + indicator arrays from priceHistory */
function buildSeries(priceHistory) {
  const candles = [];
  const closes  = [];
  const sma20   = [];
  const sma50   = [];
  const bbUp    = [];
  const bbLow   = [];
  const bbMid   = [];

  let prevT = 0;
  for (const bar of priceHistory) {
    const t = toEpoch(bar.Datetime);
    if (!t) continue;
    // lightweight-charts requires strictly ascending times — skip duplicates
    if (t <= prevT) continue;
    prevT = t;

    candles.push({
      time: t,
      open:  bar.Open  ?? bar.Close,
      high:  bar.High  ?? bar.Close,
      low:   bar.Low   ?? bar.Close,
      close: bar.Close,
    });

    closes.push({ time: t, value: bar.Close });

    if (bar.SMA20)  sma20.push({ time: t, value: bar.SMA20 });
    if (bar.SMA50)  sma50.push({ time: t, value: bar.SMA50 });
    if (bar.BB_UP)  bbUp.push({ time: t, value: bar.BB_UP });
    if (bar.BB_LOW) bbLow.push({ time: t, value: bar.BB_LOW });
    if (bar.BB_MID) bbMid.push({ time: t, value: bar.BB_MID });
  }

  return { candles, closes, sma20, sma50, bbUp, bbLow, bbMid };
}

/** Build trade markers from tradeLog overlaid on priceHistory timestamps */
function buildMarkers(tradeLog, priceHistory) {
  if (!tradeLog?.length || !priceHistory?.length) return [];

  const stepToTime = {};
  priceHistory.forEach((bar, i) => {
    stepToTime[i] = toEpoch(bar.Datetime);
  });

  const markers = [];
  for (const t of tradeLog) {
    if (t.action !== 'BUY' && t.action !== 'SELL') continue;
    if (t.regulator_decision === 'BLOCK') continue;
    const time = stepToTime[t.step];
    if (!time) continue;

    const isBuy = t.action === 'BUY';
    markers.push({
      time,
      position: isBuy ? 'belowBar' : 'aboveBar',
      color: isBuy ? C.buyMarker : C.sellMarker,
      shape: isBuy ? 'arrowUp' : 'arrowDown',
      size: 1,
    });
  }

  markers.sort((a, b) => a.time - b.time);
  return markers;
}

/* ───────── LEGEND OVERLAY ───────── */
function Legend({ ohlc, indicators }) {
  if (!ohlc) return null;
  const up = ohlc.close >= ohlc.open;
  const arrow = up ? '\u25B2' : '\u25BC';
  const clr = up ? C.upBody : C.downBody;
  const fmt = (v) => v != null ? v.toFixed(2) : '\u2014';

  return (
    <div style={{
      position: 'absolute', top: 10, left: 14, zIndex: 10,
      display: 'flex', flexWrap: 'wrap', gap: '6px 16px',
      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
      pointerEvents: 'none', lineHeight: 1.6,
    }}>
      <span style={{ color: '#f1f5f9', fontWeight: 700, marginRight: 4 }}>
        <span style={{ color: clr }}>{arrow}</span>{' '}
        O<span style={{ color: '#8892a8' }}>{fmt(ohlc.open)}</span>{' '}
        H<span style={{ color: '#8892a8' }}>{fmt(ohlc.high)}</span>{' '}
        L<span style={{ color: '#8892a8' }}>{fmt(ohlc.low)}</span>{' '}
        C<span style={{ color: clr, fontWeight: 700 }}>{fmt(ohlc.close)}</span>
      </span>
      {indicators.sma20 != null && (
        <span style={{ color: C.sma20 }}>SMA20 {fmt(indicators.sma20)}</span>
      )}
      {indicators.sma50 != null && (
        <span style={{ color: C.sma50 }}>SMA50 {fmt(indicators.sma50)}</span>
      )}
      {indicators.bbUp != null && (
        <span style={{ color: C.bbMid }}>BB {fmt(indicators.bbLow)}\u2013{fmt(indicators.bbUp)}</span>
      )}
    </div>
  );
}

/* ====================================================================
   MAIN COMPONENT
   ==================================================================== */
export default function PriceChart({
  priceHistory,
  tradeLog,
  highlightStep,
  onJump,
  maxReachedStep = 0,
  maxSteps,
  currentStep,
}) {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const candleRef    = useRef(null);
  const lineRef      = useRef(null);
  const sma20Ref     = useRef(null);
  const sma50Ref     = useRef(null);
  const bbUpRef      = useRef(null);
  const bbLowRef     = useRef(null);
  const bbMidRef     = useRef(null);
  const markersRef   = useRef(null);  // v5 marker primitive

  const [mode, setMode]         = useState('candle');
  const [legendData, setLegend] = useState(null);

  const [scrubValue, setScrubValue] = useState(currentStep);
  const isDragging = useRef(false);

  // Keep scrubValue in sync with currentStep when not dragging
  useEffect(() => {
    if (!isDragging.current) setScrubValue(currentStep);
  }, [currentStep]);

  const series  = useMemo(() => priceHistory?.length ? buildSeries(priceHistory) : null, [priceHistory]);
  const markers = useMemo(() => buildMarkers(tradeLog, priceHistory), [tradeLog, priceHistory]);

  /* ── CREATE chart once ── */
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: 420,
      layout: {
        background: { color: 'transparent' },
        textColor: C.text,
        fontFamily: "'JetBrains Mono', 'Inter', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: C.grid },
        horzLines: { color: C.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: C.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#0e111c' },
        horzLine: { color: C.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#0e111c' },
      },
      rightPriceScale: {
        borderColor: C.border,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: C.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 6,
      },
      handleScroll: { vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true },
    });

    const candle = chart.addSeries(CandlestickSeries, {
      upColor:          C.upBody,
      downColor:        C.downBody,
      borderUpColor:    C.upBody,
      borderDownColor:  C.downBody,
      wickUpColor:      C.upWick,
      wickDownColor:    C.downWick,
    });
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } });

    const line = chart.addSeries(LineSeries, {
      color: C.line,
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: C.line,
      crosshairMarkerBackgroundColor: '#0e111c',
      visible: false,
    });

    const sma20 = chart.addSeries(LineSeries, { color: C.sma20, lineWidth: 1, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
    const sma50 = chart.addSeries(LineSeries, { color: C.sma50, lineWidth: 1, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
    const bbUp  = chart.addSeries(LineSeries, { color: C.bbBand, lineWidth: 1, lineStyle: LineStyle.Dashed, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
    const bbLow = chart.addSeries(LineSeries, { color: C.bbBand, lineWidth: 1, lineStyle: LineStyle.Dashed, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
    const bbM   = chart.addSeries(LineSeries, { color: C.bbMid,  lineWidth: 1, lineStyle: LineStyle.Dotted, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });

    chartRef.current  = chart;
    candleRef.current = candle;
    lineRef.current   = line;
    sma20Ref.current  = sma20;
    sma50Ref.current  = sma50;
    bbUpRef.current   = bbUp;
    bbLowRef.current  = bbLow;
    bbMidRef.current  = bbM;

    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time) { setLegend(null); return; }
      const cd  = param.seriesData.get(candle);
      const s20 = param.seriesData.get(sma20);
      const s50 = param.seriesData.get(sma50);
      const bU  = param.seriesData.get(bbUp);
      const bL  = param.seriesData.get(bbLow);
      if (cd) {
        setLegend({
          ohlc: { open: cd.open, high: cd.high, low: cd.low, close: cd.close },
          indicators: {
            sma20: s20?.value ?? null,
            sma50: s50?.value ?? null,
            bbUp:  bU?.value  ?? null,
            bbLow: bL?.value  ?? null,
          },
        });
      }
    });

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        chart.applyOptions({ width: e.contentRect.width });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  /* ── UPDATE series data ── */
  useEffect(() => {
    if (!series || !chartRef.current) return;

    candleRef.current.setData(series.candles);
    lineRef.current.setData(series.closes);
    sma20Ref.current.setData(series.sma20);
    sma50Ref.current.setData(series.sma50);
    bbUpRef.current.setData(series.bbUp);
    bbLowRef.current.setData(series.bbLow);
    bbMidRef.current.setData(series.bbMid);

    // v5: use createSeriesMarkers primitive
    if (markersRef.current) {
      markersRef.current.setMarkers(markers);
    } else if (markers.length && candleRef.current) {
      markersRef.current = createSeriesMarkers(candleRef.current, markers);
    }

    if (series.candles.length) {
      candleRef.current.applyOptions({
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineColor: C.priceLine,
        priceLineWidth: 1,
        priceLineStyle: LineStyle.Dashed,
      });
      lineRef.current.applyOptions({
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineColor: C.priceLine,
        priceLineWidth: 1,
        priceLineStyle: LineStyle.Dashed,
      });
    }

    chartRef.current.timeScale().scrollToRealTime();

    if (series.candles.length) {
      const last    = series.candles[series.candles.length - 1];
      const s20Last = series.sma20.length ? series.sma20[series.sma20.length - 1].value : null;
      const s50Last = series.sma50.length ? series.sma50[series.sma50.length - 1].value : null;
      const bULast  = series.bbUp.length  ? series.bbUp[series.bbUp.length - 1].value   : null;
      const bLLast  = series.bbLow.length ? series.bbLow[series.bbLow.length - 1].value  : null;
      setLegend({
        ohlc: { open: last.open, high: last.high, low: last.low, close: last.close },
        indicators: { sma20: s20Last, sma50: s50Last, bbUp: bULast, bbLow: bLLast },
      });
    }
  }, [series, markers]);

  /* ── Toggle candle / line ── */
  useEffect(() => {
    if (!candleRef.current || !lineRef.current) return;
    const isCandle = mode === 'candle';
    candleRef.current.applyOptions({ visible: isCandle });
    lineRef.current.applyOptions({ visible: !isCandle });
  }, [mode]);

  /* ── RENDER ── */
  const hasData = priceHistory && priceHistory.length > 0;

  return (
    <div className="card chart-card" style={{ padding: '12px 14px 14px' }}>
      <div className="chart-header">
        <h2 style={{ marginBottom: 0 }}>Price Chart</h2>
        {hasData && (
          <div className="chart-controls" style={{ gap: 10 }}>
            <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
              <button
                onClick={() => setMode('candle')}
                style={{
                  padding: '4px 12px', fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: mode === 'candle' ? 'rgba(0,212,255,0.15)' : 'transparent',
                  color: mode === 'candle' ? '#38bdf8' : '#64748b',
                  transition: 'all 0.15s',
                }}
              >
                Candles
              </button>
              <button
                onClick={() => setMode('line')}
                style={{
                  padding: '4px 12px', fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: mode === 'line' ? 'rgba(0,212,255,0.15)' : 'transparent',
                  color: mode === 'line' ? '#38bdf8' : '#64748b',
                  transition: 'all 0.15s',
                }}
              >
                Line
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ position: 'relative', marginTop: 4 }}>
        {hasData && <Legend ohlc={legendData?.ohlc} indicators={legendData?.indicators ?? {}} />}
        {/* Always render the container so the ref is available for chart creation */}
        <div ref={containerRef} style={{ width: '100%', height: 420 }} />
        {!hasData && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#64748b', fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
            background: 'transparent', zIndex: 5,
          }}>
            Initialize a simulation to see the chart ◈
          </div>
        )}
      </div>

      {/* ── Latest Trade Notification ── */}
      {hasData && (() => {
        const latest = tradeLog
          ?.filter(t => (t.action === 'BUY' || t.action === 'SELL') && t.regulator_decision !== 'BLOCK')
          .at(-1);
        if (!latest) return null;
        const isBuy = latest.action === 'BUY';
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', marginTop: 4,
            background: isBuy ? 'rgba(0,255,136,0.06)' : 'rgba(255,59,92,0.06)',
            borderRadius: 6,
            border: `1px solid ${isBuy ? 'rgba(0,255,136,0.15)' : 'rgba(255,59,92,0.15)'}`,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            color: isBuy ? C.buyMarker : C.sellMarker,
            transition: 'all 0.2s ease',
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 18, height: 18, borderRadius: 4, fontSize: 9, fontWeight: 700,
              background: isBuy ? 'rgba(0,255,136,0.15)' : 'rgba(255,59,92,0.15)',
            }}>
              {isBuy ? '▲' : '▼'}
            </span>
            <span style={{ fontWeight: 600 }}>{latest.action}</span>
            <span style={{ color: '#8892a8' }}>·</span>
            <span style={{ color: '#cbd5e1' }}>{latest.agent_name}</span>
            <span style={{ color: '#8892a8' }}>·</span>
            <span style={{ color: '#8892a8' }}>{latest.quantity} @ ₹{latest.price?.toFixed(2)}</span>
            <span style={{ color: '#64748b', marginLeft: 'auto', fontSize: 10 }}>Step {latest.step}</span>
          </div>
        );
      })()}

      {maxSteps > 0 && (
        <div className="scrubber">
          <span>Step: {isDragging.current ? scrubValue : currentStep}</span>
          <input
            type="range"
            min={0}
            max={maxReachedStep}
            value={isDragging.current ? scrubValue : currentStep}
            onChange={e => {
              isDragging.current = true;
              setScrubValue(Number(e.target.value));
            }}
            onMouseUp={() => {
              isDragging.current = false;
              onJump(scrubValue);
            }}
            onTouchEnd={() => {
              isDragging.current = false;
              onJump(scrubValue);
            }}
            className="scrubber-input"
          />
          <span>{maxReachedStep}</span>
        </div>
      )}
    </div>
  );
}
