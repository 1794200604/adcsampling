import { useState, useRef, useCallback } from "react";

const N = 20;
const SAMPLE_MIN = 480;
const SAMPLE_MAX = 530;

function randSample() {
  if (Math.random() < 0.08) {
    return Math.random() < 0.5 ? Math.floor(Math.random() * 30) + 2 : Math.floor(Math.random() * 150) + 900;
  }
  return Math.floor(Math.random() * (SAMPLE_MAX - SAMPLE_MIN)) + SAMPLE_MIN;
}

const PH = { IDLE: 0, SAMPLING: 1, SORTING: 2, MEDIAN: 3, STORE: 4, AVG: 5, DONE: 6 };
const PH_TEXT = {
  [PH.IDLE]: "等待开始",
  [PH.SAMPLING]: "正在采样…",
  [PH.SORTING]: "排序中…",
  [PH.MEDIAN]: "取中值",
  [PH.STORE]: "存入缓冲区",
  [PH.AVG]: "计算均值",
  [PH.DONE]: "本轮完成",
};

const isOutlier = (v) => v !== null && v !== 0 && (v < SAMPLE_MIN - 100 || v > SAMPLE_MAX + 100);

export default function App() {
  // persistent arrays (survive across rounds)
  const arrA = useRef(Array(N).fill(0));
  const arrB = useRef(Array(N).fill(0));
  const ptrA = useRef(0);
  const ptrB = useRef(0);

  const [dispA, setDispA] = useState(Array(N).fill(0));
  const [dispB, setDispB] = useState(Array(N).fill(0));
  const [sortDisp, setSortDisp] = useState([]);
  const [phase, setPhase] = useState(PH.IDLE);
  const [activeA, setActiveA] = useState(-1);       // currently writing index in A
  const [sortCmp, setSortCmp] = useState([-1, -1]);
  const [medianIdx, setMedianIdx] = useState(-1);
  const [medianVal, setMedianVal] = useState(null);
  const [activeB, setActiveB] = useState(-1);        // currently writing index in B
  const [avgHL, setAvgHL] = useState(-1);
  const [avgVal, setAvgVal] = useState(null);
  const [roundNum, setRoundNum] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [sampleCount, setSampleCount] = useState(3);
  const [autoRounds, setAutoRounds] = useState(20);
  const [speed, setSpeed] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [log, setLog] = useState([]);
  const timerRef = useRef(null);
  const cancelRef = useRef(false);

  const wait = useCallback(
      (ms) => new Promise((r) => { timerRef.current = setTimeout(r, ms / speed); }),
      [speed]
  );
  const stopped = () => cancelRef.current;

  const addLog = useCallback((msg) => {
    setLog((p) => {
      const next = [...p, msg];
      return next.length > 60 ? next.slice(-60) : next;
    });
  }, []);

  const hardReset = useCallback(() => {
    cancelRef.current = true;
    clearTimeout(timerRef.current);
    setTimeout(() => {
      cancelRef.current = false;
      arrA.current = Array(N).fill(0);
      arrB.current = Array(N).fill(0);
      ptrA.current = 0;
      ptrB.current = 0;
      setDispA(Array(N).fill(0));
      setDispB(Array(N).fill(0));
      setSortDisp([]);
      setPhase(PH.IDLE);
      setActiveA(-1);
      setSortCmp([-1, -1]);
      setMedianIdx(-1);
      setMedianVal(null);
      setActiveB(-1);
      setAvgHL(-1);
      setAvgVal(null);
      setRoundNum(0);
      setTotalRounds(0);
      setIsRunning(false);
      setLog([]);
    }, 50);
  }, []);

  // Execute one complete round
  const runOneRound = useCallback(async (roundLabel) => {
    const count = sampleCount;

    // --- SAMPLING ---
    setPhase(PH.SAMPLING);
    addLog(`── 第${roundLabel}轮：采集 ${count} 个样本 ──`);
    for (let k = 0; k < count; k++) {
      if (stopped()) return false;
      const idx = ptrA.current;
      const val = randSample();
      arrA.current[idx] = val;
      ptrA.current = (ptrA.current + 1) % N;
      setActiveA(idx);
      setDispA([...arrA.current]);
      addLog(`  A[${idx}] ← ${val}`);
      await wait(140);
    }
    setActiveA(-1);
    await wait(250);

    // --- SORTING ---
    if (stopped()) return false;
    setPhase(PH.SORTING);
    let sorted = [...arrA.current];
    setSortDisp([...sorted]);
    await wait(150);

    for (let i = 0; i < N - 1; i++) {
      let swapped = false;
      for (let j = 0; j < N - 1 - i; j++) {
        if (stopped()) return false;
        setSortCmp([j, j + 1]);
        if (sorted[j] > sorted[j + 1]) {
          [sorted[j], sorted[j + 1]] = [sorted[j + 1], sorted[j]];
          setSortDisp([...sorted]);
          swapped = true;
        }
        await wait(12);
      }
      if (!swapped) break;
    }
    setSortCmp([-1, -1]);
    await wait(200);

    // --- TAKE MEDIAN ---
    if (stopped()) return false;
    setPhase(PH.MEDIAN);
    const mid = Math.floor(N / 2);
    setMedianIdx(mid);
    const mVal = sorted[mid];
    setMedianVal(mVal);
    addLog(`  中值 = sorted[${mid}] = ${mVal}`);
    await wait(500);

    // --- STORE TO B ---
    if (stopped()) return false;
    setPhase(PH.STORE);
    const bIdx = ptrB.current;
    arrB.current[bIdx] = mVal;
    ptrB.current = (ptrB.current + 1) % N;
    setActiveB(bIdx);
    setDispB([...arrB.current]);
    addLog(`  B[${bIdx}] ← ${mVal}`);
    await wait(400);
    setActiveB(-1);

    // --- AVERAGE ---
    if (stopped()) return false;
    setPhase(PH.AVG);
    let sum = 0;
    for (let i = 0; i < N; i++) {
      if (stopped()) return false;
      setAvgHL(i);
      sum += arrB.current[i];
      await wait(30);
    }
    const avg = Math.round((sum / N) * 10) / 10;
    setAvgVal(avg);
    addLog(`  均值 = ${avg}`);
    await wait(300);
    setAvgHL(-1);

    setPhase(PH.DONE);
    await wait(200);
    return true;
  }, [sampleCount, wait, addLog]);

  const runSingle = useCallback(async () => {
    cancelRef.current = false;
    setIsRunning(true);
    setSortDisp([]);
    setMedianIdx(-1);
    setMedianVal(null);
    setAvgVal(null);
    setAvgHL(-1);
    const r = totalRounds + 1;
    setTotalRounds(r);
    setRoundNum(r);
    const ok = await runOneRound(r);
    if (ok) setPhase(PH.DONE);
    setIsRunning(false);
  }, [runOneRound, totalRounds]);

  const runMulti = useCallback(async () => {
    cancelRef.current = false;
    setIsRunning(true);
    let r = totalRounds;
    for (let i = 0; i < autoRounds; i++) {
      if (cancelRef.current) break;
      r++;
      setTotalRounds(r);
      setRoundNum(r);
      setSortDisp([]);
      setMedianIdx(-1);
      setMedianVal(null);
      setAvgHL(-1);
      const ok = await runOneRound(r);
      if (!ok) break;
    }
    setIsRunning(false);
  }, [runOneRound, totalRounds, autoRounds]);

  const ptrANow = ptrA.current;
  const ptrBNow = ptrB.current;

  return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg,#060b18 0%,#0c1527 40%,#0a1020 100%)",
        color: "#e2e8f0", fontFamily: "'JetBrains Mono','Fira Code',monospace",
        padding: "16px 20px", boxSizing: "border-box", overflow: "auto",
      }}>
        <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Noto+Sans+SC:wght@300;400;500;700;900&display=swap');
        @keyframes glow{0%,100%{box-shadow:0 0 6px rgba(16,185,129,.3)}50%{box-shadow:0 0 18px rgba(16,185,129,.8)}}
        @keyframes pop{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes writePulse{0%{box-shadow:0 0 0 0 rgba(59,130,246,.5)}70%{box-shadow:0 0 0 6px rgba(59,130,246,0)}100%{box-shadow:0 0 0 0 rgba(59,130,246,0)}}
        .pop{animation:pop .2s ease-out}
        .glow{animation:glow 1s ease-in-out infinite}
        .wpulse{animation:writePulse .6s ease-out}
        .fade{animation:fadeIn .2s ease-out}
        .cell{
          display:flex;align-items:center;justify-content:center;flex-direction:column;
          border-radius:3px;font-size:10px;font-weight:500;
          transition:background .1s,border-color .1s;
          border:1px solid rgba(255,255,255,.05);min-height:40px;position:relative;
        }
        .cell .idx{font-size:7px;color:#475569;margin-top:1px;font-weight:400}
        .hd{font-family:'Noto Sans SC',sans-serif;font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;margin-bottom:6px}
        .btn{padding:7px 16px;border:none;border-radius:5px;font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;letter-spacing:.5px}
        .btn:disabled{opacity:.25;cursor:not-allowed}
        .go{background:linear-gradient(135deg,#10b981,#059669);color:#fff}
        .go:hover:not(:disabled){box-shadow:0 3px 12px rgba(16,185,129,.4);transform:translateY(-1px)}
        .rst{background:rgba(239,68,68,.1);color:#f87171;border:1px solid rgba(239,68,68,.15)}
        .sp{padding:3px 9px;border-radius:3px;font-size:10px;cursor:pointer;border:1px solid rgba(255,255,255,.08);font-family:inherit;font-weight:600;background:rgba(255,255,255,.02);color:#64748b;transition:all .1s}
        .sp.on{background:rgba(59,130,246,.2);color:#60a5fa;border-color:rgba(59,130,246,.35)}
        .inp{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:4px;color:#e2e8f0;font-family:inherit;font-size:12px;font-weight:600;padding:4px 8px;width:48px;text-align:center;outline:none}
        .inp:focus{border-color:#3b82f6}
        .logbox{font-size:9px;color:#64748b;max-height:140px;overflow-y:auto;padding:6px 8px;background:rgba(0,0,0,.2);border-radius:4px;border:1px solid rgba(255,255,255,.04)}
        .logbox::-webkit-scrollbar{width:4px}
        .logbox::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px}
        .ptr-arrow{position:absolute;top:-10px;font-size:8px;color:#f59e0b;font-weight:700}
      `}</style>

        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <h1 style={{
            fontFamily: "'Noto Sans SC',sans-serif", fontSize: 22, fontWeight: 900, margin: 0,
            background: "linear-gradient(135deg,#10b981,#3b82f6)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>ADC 中值+均值 滤波动画</h1>
          <p style={{ color: "#475569", fontSize: 11, marginTop: 3, fontFamily: "'Noto Sans SC',sans-serif" }}>
            循环覆盖写入 · 数组初始值为 0 · 每轮采样后立即排序取中值再求均值
          </p>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'Noto Sans SC',sans-serif" }}>每轮采样数:</span>
            <input className="inp" type="number" min={1} max={20} value={sampleCount}
                   disabled={isRunning}
                   onChange={e => { const v = Math.max(1, Math.min(20, parseInt(e.target.value) || 1)); setSampleCount(v); }} />
          </div>
          <button className="btn go" disabled={isRunning} onClick={runSingle}>▶ 执行 1 轮</button>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button className="btn go" disabled={isRunning} onClick={runMulti}>⏩ 连续</button>
            <input className="inp" type="number" min={1} max={100} value={autoRounds}
                   disabled={isRunning} style={{ width: 40 }}
                   onChange={e => { const v = Math.max(1, Math.min(100, parseInt(e.target.value) || 1)); setAutoRounds(v); }} />
            <span style={{ fontSize: 10, color: "#64748b" }}>轮</span>
          </div>
          <button className="btn rst" onClick={hardReset}>↺ 重置</button>
          <div style={{ display: "flex", gap: 3, alignItems: "center", marginLeft: 4 }}>
            <span style={{ fontSize: 10, color: "#64748b" }}>速度:</span>
            {[1, 2, 4, 8].map(s => (
                <button key={s} className={`sp ${speed === s ? "on" : ""}`} onClick={() => setSpeed(s)}>{s}x</button>
            ))}
          </div>
        </div>

        {/* Phase + round */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <div className="fade" key={`${phase}-${roundNum}`} style={{
            padding: "5px 16px", background: "rgba(16,185,129,.06)", border: "1px solid rgba(16,185,129,.15)",
            borderRadius: 6, display: "flex", alignItems: "center", gap: 8,
            fontFamily: "'Noto Sans SC',sans-serif", fontSize: 12, fontWeight: 600,
          }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: phase === PH.IDLE ? "#475569" : phase === PH.DONE ? "#10b981" : "#f59e0b",
            boxShadow: phase > PH.IDLE && phase < PH.DONE ? "0 0 6px #f59e0b" : "none",
          }}/>
            {PH_TEXT[phase]}
            {roundNum > 0 && <span style={{ color: "#64748b", fontWeight: 400 }}>第 {roundNum} 轮</span>}
            {medianVal !== null && <span style={{ color: "#10b981" }}>中值={medianVal}</span>}
            {avgVal !== null && <span style={{ color: "#8b5cf6" }}>均值={avgVal}</span>}
          </div>
        </div>

        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          {/* Row 1: A + Sorted */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            {/* Array A */}
            <div style={{ background: "rgba(255,255,255,.015)", borderRadius: 8, border: "1px solid rgba(255,255,255,.05)", padding: 12 }}>
              <div className="hd" style={{ color: "#3b82f6" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "#3b82f6" }}/>
                原始采样 A[{N}]
                <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 400, color: "#475569" }}>
                写指针 → {ptrANow}
              </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(10,1fr)`, gap: 2 }}>
                {dispA.map((v, i) => {
                  const isWriting = i === activeA && phase === PH.SAMPLING;
                  const isPtr = i === ptrANow && phase !== PH.SAMPLING;
                  const zero = v === 0;
                  return (
                      <div key={i} className={`cell ${isWriting ? "wpulse" : ""}`} style={{
                        background: isWriting ? "rgba(59,130,246,.35)"
                            : isOutlier(v) ? "rgba(239,68,68,.2)"
                                : zero ? "rgba(255,255,255,.015)"
                                    : "rgba(255,255,255,.05)",
                        color: isWriting ? "#93c5fd" : isOutlier(v) ? "#fca5a5" : zero ? "#334155" : "#cbd5e1",
                        borderColor: isWriting ? "#3b82f6" : isOutlier(v) ? "rgba(239,68,68,.3)" : "rgba(255,255,255,.05)",
                      }}>
                        {isPtr && <span className="ptr-arrow">▼</span>}
                        {v}
                        <span className="idx">[{i}]</span>
                      </div>
                  );
                })}
              </div>
            </div>

            {/* Sorted */}
            <div style={{ background: "rgba(255,255,255,.015)", borderRadius: 8, border: "1px solid rgba(255,255,255,.05)", padding: 12 }}>
              <div className="hd" style={{ color: "#f59e0b" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "#f59e0b" }}/>
                排序后（升序）
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(10,1fr)`, gap: 2 }}>
                {(sortDisp.length ? sortDisp : Array(N).fill(0)).map((v, i) => {
                  const isMid = medianIdx === i;
                  const isCmp = sortCmp.includes(i);
                  const zero = v === 0;
                  return (
                      <div key={i} className={`cell ${isMid ? "glow" : ""}`} style={{
                        background: isMid ? "rgba(16,185,129,.25)"
                            : isCmp ? "rgba(245,158,11,.3)"
                                : zero ? "rgba(255,255,255,.015)"
                                    : "rgba(255,255,255,.05)",
                        color: isMid ? "#34d399" : isCmp ? "#fbbf24" : zero ? "#334155" : "#cbd5e1",
                        fontWeight: isMid ? 700 : isCmp ? 600 : 400,
                        borderColor: isMid ? "#10b981" : isCmp ? "#f59e0b" : "rgba(255,255,255,.05)",
                      }}>
                        {v}
                        <span className="idx">[{i}]</span>
                      </div>
                  );
                })}
              </div>
              {medianVal !== null && (
                  <div style={{ marginTop: 6, fontSize: 12, fontFamily: "'Noto Sans SC',sans-serif", color: "#10b981", fontWeight: 700 }}>
                    ◆ 中值 = sorted[{Math.floor(N / 2)}] = {medianVal}
                  </div>
              )}
            </div>
          </div>

          {/* Buffer B */}
          <div style={{ background: "rgba(255,255,255,.015)", borderRadius: 8, border: "1px solid rgba(255,255,255,.05)", padding: 12, marginBottom: 12 }}>
            <div className="hd" style={{ color: "#8b5cf6" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#8b5cf6" }}/>
              中值缓冲区 B[{N}]
              <span style={{ fontSize: 10, fontWeight: 400, color: "#475569" }}>写指针 → {ptrBNow}</span>
              {avgVal !== null && (
                  <span style={{
                    marginLeft: "auto", fontSize: 14, color: "#10b981", fontWeight: 700,
                    background: "rgba(16,185,129,.08)", padding: "3px 12px", borderRadius: 5,
                    border: "1px solid rgba(16,185,129,.15)",
                  }}>均值 = {avgVal}</span>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${N},1fr)`, gap: 2 }}>
              {dispB.map((v, i) => {
                const isWriting = i === activeB;
                const isHL = i === avgHL;
                const isPtr = i === ptrBNow && activeB === -1;
                const zero = v === 0;
                return (
                    <div key={i} className={`cell ${isWriting ? "pop" : ""}`} style={{
                      background: isWriting ? "rgba(139,92,246,.4)"
                          : isHL ? "rgba(245,158,11,.25)"
                              : zero ? "rgba(255,255,255,.015)"
                                  : "rgba(139,92,246,.1)",
                      color: isWriting ? "#e9d5ff" : isHL ? "#fbbf24" : zero ? "#1e293b" : "#c4b5fd",
                      borderColor: isWriting ? "#8b5cf6" : isHL ? "#f59e0b" : zero ? "rgba(255,255,255,.03)" : "rgba(139,92,246,.2)",
                      minHeight: 36, fontSize: 10,
                    }}>
                      {isPtr && <span className="ptr-arrow">▼</span>}
                      {v}
                      <span className="idx">[{i}]</span>
                    </div>
                );
              })}
            </div>
          </div>

          {/* Log */}
          <div style={{ background: "rgba(255,255,255,.015)", borderRadius: 8, border: "1px solid rgba(255,255,255,.05)", padding: 12 }}>
            <div className="hd" style={{ color: "#64748b" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#475569" }}/>
              操作日志
            </div>
            <div className="logbox" ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
              {log.length === 0
                  ? <span style={{ color: "#334155" }}>设置每轮采样数，点击执行开始…</span>
                  : log.map((l, i) => (
                      <div key={i} style={{ color: l.startsWith("──") ? "#60a5fa" : l.includes("中值") ? "#10b981" : l.includes("均值") ? "#8b5cf6" : "#64748b" }}>
                        {l}
                      </div>
                  ))}
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginTop: 10 }}>
            {[
              { c: "#3b82f6", l: "正在写入" }, { c: "#ef4444", l: "异常值" },
              { c: "#f59e0b", l: "比较/累加" }, { c: "#10b981", l: "中值" },
              { c: "#8b5cf6", l: "缓冲区" }, { c: "#f59e0b", l: "▼ 写指针", border: true },
            ].map(x => (
                <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#64748b" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: x.c }}/>
                  <span style={{ fontFamily: "'Noto Sans SC',sans-serif" }}>{x.l}</span>
                </div>
            ))}
          </div>
        </div>
      </div>
  );
}


