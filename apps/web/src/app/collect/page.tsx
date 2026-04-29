'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface LogEntry {
  timestamp: string;
  message: string;
}

interface TaskResult {
  characterId: number;
  success: boolean;
  totalEvents: number;
  totalReactions: number;
  stages: Array<{ stage: string; success: boolean; duration: number; message?: string }>;
}

interface ProgressData {
  stage: string;
  stageIndex: number;
  totalStages: number;
  roundIndex?: number;
  maxRounds?: number;
  eventsCount?: number;
  reactionsCount?: number;
  message?: string;
}

type PageState = 'form' | 'collecting' | 'done';

export default function CollectPage() {
  const [state, setState] = useState<PageState>('form');
  const [existingId, setExistingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'historical' | 'fictional'>('historical');
  const [sourceTags, setSourceTags] = useState<string[]>([]);
  const [sourceInput, setSourceInput] = useState('');
  const [rounds, setRounds] = useState(5);
  const [aliasInput, setAliasInput] = useState('');
  const [aliasTags, setAliasTags] = useState<string[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<TaskResult | null>(null);
  const [error, setError] = useState('');
  const [taskId, setTaskId] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [submitError, setSubmitError] = useState('');
  const logContainerRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // 从 URL 参数读取 existingId、name、type
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eid = params.get('existingId');
    const n = params.get('name');
    const t = params.get('type');
    if (eid) setExistingId(Number(eid));
    if (n) setName(n);
    if (t === 'fictional') setType('fictional');
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (state === 'collecting') {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state]);

  const addAliasTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (trimmed && !aliasTags.includes(trimmed)) {
        setAliasTags((prev) => [...prev, trimmed]);
      }
    },
    [aliasTags],
  );

  const removeAliasTag = useCallback((index: number) => {
    setAliasTags((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleAliasKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const value = aliasInput.replace(/[,，]/g, '').trim();
        if (value) {
          addAliasTag(value);
          setAliasInput('');
        }
      }
      if (e.key === 'Backspace' && aliasInput === '' && aliasTags.length > 0) {
        removeAliasTag(aliasTags.length - 1);
      }
    },
    [aliasInput, aliasTags, addAliasTag, removeAliasTag],
  );

  const addSourceTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (trimmed && !sourceTags.includes(trimmed)) {
        setSourceTags((prev) => [...prev, trimmed]);
      }
    },
    [sourceTags],
  );

  const removeSourceTag = useCallback((index: number) => {
    setSourceTags((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSourceKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const value = sourceInput.replace(/[,，]/g, '').trim();
        if (value) {
          addSourceTag(value);
          setSourceInput('');
        }
      }
      if (e.key === 'Backspace' && sourceInput === '' && sourceTags.length > 0) {
        removeSourceTag(sourceTags.length - 1);
      }
    },
    [sourceInput, sourceTags, addSourceTag, removeSourceTag],
  );

  const handleSSE = useCallback((id: string) => {
    const es = new EventSource(`/api/collect?taskId=${id}`);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      switch (data.type) {
        case 'log':
          setLogs((prev) => [...prev, { timestamp: data.timestamp, message: data.message }]);
          break;
        case 'progress':
          setProgress(data.progress);
          break;
        case 'complete':
          setResult(data.result);
          setState('done');
          es.close();
          // 浏览器通知
          if (Notification.permission === 'granted') {
            new Notification('神探 - 收集完成', {
              body: `${name} 已完成收集，共 ${data.result.totalEvents} 个事件`,
            });
          }
          break;
        case 'error':
          setError(data.message);
          setState('done');
          es.close();
          break;
        case 'cancelled':
          setError('任务已取消');
          setState('done');
          es.close();
          break;
      }
    };

    es.onerror = () => {
      es.close();
    };

    return es;
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLogs([]);
    setResult(null);
    setError('');
    setSubmitError('');
    setProgress(null);
    startTimeRef.current = Date.now();
    setElapsed(0);

    // 处理输入框中残留的别名
    const allAliases = [...aliasTags];
    if (aliasInput.trim()) {
      aliasInput.split(/[,，]/).forEach((s) => {
        const trimmed = s.trim();
        if (trimmed && !allAliases.includes(trimmed)) allAliases.push(trimmed);
      });
    }

    // 处理输入框中残留的来源
    const allSources = [...sourceTags];
    if (sourceInput.trim()) {
      sourceInput.split(/[,，]/).forEach((s) => {
        const trimmed = s.trim();
        if (trimmed && !allSources.includes(trimmed)) allSources.push(trimmed);
      });
    }

    const res = await fetch('/api/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        characterName: name.trim(),
        characterType: type,
        source: allSources.length > 0 ? allSources : undefined,
        maxRounds: rounds,
        aliases: allAliases.length > 0 ? allAliases.join(',') : undefined,
        existingCharacterId: existingId ?? undefined,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      if (res.status === 429) {
        setSubmitError(err.error || '并发任务已达上限');
      } else {
        setError(err.error || '启动失败');
        setState('done');
      }
      return;
    }

    const { taskId: id } = await res.json();
    setTaskId(id);
    setState('collecting');

    // 请求通知权限
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    handleSSE(id);
  };

  const handleCancel = async () => {
    if (taskId) {
      await fetch(`/api/collect?taskId=${taskId}`, { method: 'DELETE' });
    }
    setState('form');
  };

  const handleReset = () => {
    setName('');
    setSourceTags([]);
    setSourceInput('');
    setResult(null);
    setError('');
    setSubmitError('');
    setProgress(null);
    setLogs([]);
    setAliasTags([]);
    setAliasInput('');
    setState('form');
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/" className="back-link">
          ← 返回
        </Link>
        <Link href="/tasks" className="back-link">
          任务管理 →
        </Link>
      </div>

      <div className="header">
        <h1 className="glitch">收集角色信息</h1>
        <p className="header-subtitle">输入角色名称，AI 将自动搜索生平事迹和各方反应</p>
      </div>

      {state === 'form' && (
        <form onSubmit={handleSubmit} className="collect-form">
          <div className="form-group">
            <label>角色名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：特朗普、哈利波特、曹操..."
              required
            />
          </div>

          <div className="form-group">
            <label>角色类型</label>
            <div className="radio-group">
              <label className={`radio-btn ${type === 'historical' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="type"
                  value="historical"
                  checked={type === 'historical'}
                  onChange={() => setType('historical')}
                />
                历史人物
              </label>
              <label className={`radio-btn ${type === 'fictional' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="type"
                  value="fictional"
                  checked={type === 'fictional'}
                  onChange={() => setType('fictional')}
                />
                虚构角色
              </label>
            </div>
          </div>

          {type === 'fictional' && (
            <div className="form-group">
              <label>来源作品</label>
              <div className="alias-input-container">
                {sourceTags.map((tag, i) => (
                  <span key={i} className="alias-tag">
                    {tag}
                    <button
                      type="button"
                      className="alias-tag-remove"
                      onClick={() => removeSourceTag(i)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={sourceInput}
                  onChange={(e) => setSourceInput(e.target.value)}
                  onKeyDown={handleSourceKeyDown}
                  onBlur={() => {
                    if (sourceInput.trim()) {
                      addSourceTag(sourceInput.trim());
                      setSourceInput('');
                    }
                  }}
                  placeholder={
                    sourceTags.length === 0
                      ? '输入来源作品后回车添加，如：哈利波特系列、三国演义...'
                      : '继续输入...'
                  }
                  className="alias-input"
                />
              </div>
              <small className="form-hint">回车或逗号添加来源作品，可输入多个</small>
            </div>
          )}

          <div className="form-group">
            <label>自定义别名</label>
            <div className="alias-input-container">
              {aliasTags.map((tag, i) => (
                <span key={i} className="alias-tag">
                  {tag}
                  <button
                    type="button"
                    className="alias-tag-remove"
                    onClick={() => removeAliasTag(i)}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={handleAliasKeyDown}
                onBlur={() => {
                  if (aliasInput.trim()) {
                    addAliasTag(aliasInput.trim());
                    setAliasInput('');
                  }
                }}
                placeholder={
                  aliasTags.length === 0
                    ? '输入别名后回车添加，如：川普、Trump、川建国'
                    : '继续输入...'
                }
                className="alias-input"
              />
            </div>
            <small className="form-hint">回车或逗号添加别名，AI 会在此基础上自动补充更多别名</small>
          </div>

          <div className="form-group">
            <label>事件拓展轮次: {rounds}</label>
            <input
              type="range"
              min={2}
              max={8}
              value={rounds}
              onChange={(e) => setRounds(parseInt(e.target.value))}
            />
            <div className="range-labels">
              <span>2 (快速)</span>
              <span>5 (默认)</span>
              <span>8 (深入)</span>
            </div>
            <small className="form-hint">实际轮次由动态质量评估决定，可能少于最大值</small>
          </div>

          <button type="submit" className="btn-primary">
            开始收集
          </button>
          {submitError && <p className="form-error">{submitError}</p>}
        </form>
      )}

      {state === 'collecting' && (
        <div className="collect-progress">
          <div className="progress-header">
            <h2>正在收集: {name}</h2>
            <div className="progress-meta">
              <span className="timer">{formatTime(elapsed)}</span>
              <button onClick={handleCancel} className="btn-cancel">
                取消
              </button>
            </div>
          </div>

          {progress && (
            <div className="progress-bar-container">
              <div
                className="progress-bar"
                style={{
                  width: `${Math.round(((progress.stageIndex + 1) / progress.totalStages) * 100)}%`,
                }}
              ></div>
              <div className="progress-info">
                <span>{progress.message || progress.stage}</span>
                {progress.eventsCount !== undefined && <span>事件: {progress.eventsCount}</span>}
                {progress.roundIndex !== undefined && (
                  <span>
                    轮次: {progress.roundIndex}/{progress.maxRounds}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="progress-stages">
            <div
              className={`stage ${progress?.stage === 'biographer' || logs.some((l) => l.message.includes('[Biographer]')) ? 'active' : ''}`}
            >
              <span className="stage-dot"></span>
              生平采集
            </div>
            <div
              className={`stage ${progress?.stage === 'event-explorer' || logs.some((l) => l.message.includes('[EventExplorer]')) ? 'active' : ''}`}
            >
              <span className="stage-dot"></span>
              事件拓展
            </div>
            <div
              className={`stage ${progress?.stage === 'statement-collector' || logs.some((l) => l.message.includes('[StatementCollector]')) ? 'active' : ''}`}
            >
              <span className="stage-dot"></span>
              发言收集
            </div>
            <div
              className={`stage ${progress?.stage === 'reaction-collector' || logs.some((l) => l.message.includes('[ReactionCollector]')) ? 'active' : ''}`}
            >
              <span className="stage-dot"></span>
              反应收集
            </div>
          </div>

          <div className="terminal">
            <div className="terminal-header">
              <span className="terminal-dot" />
              <span className="terminal-dot" />
              <span className="terminal-dot" />
              <span className="terminal-title">智能体日志</span>
            </div>
            <div className="terminal-body" ref={logContainerRef}>
              {logs.map((log, i) => (
                <div key={i} className="log-line">
                  <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className="log-msg">{log.message}</span>
                </div>
              ))}
              {logs.length === 0 && <div className="log-line muted">等待 Agent 启动...</div>}
            </div>
          </div>
        </div>
      )}

      {state === 'done' && (
        <div className="collect-result">
          {error && !result ? (
            <div className="result-error">
              <h2>收集失败</h2>
              <p>{error}</p>
            </div>
          ) : (
            result && (
              <div className="result-success">
                <h2 className="glitch">收集完成</h2>
                <div className="result-stats">
                  <div className="stat">
                    <div className="stat-value">{result.totalEvents}</div>
                    <div className="stat-label">事件</div>
                  </div>
                  <div className="stat">
                    <div className="stat-value">{result.totalReactions}</div>
                    <div className="stat-label">反应</div>
                  </div>
                  <div className="stat">
                    <div className="stat-value">{formatTime(elapsed)}</div>
                    <div className="stat-label">耗时</div>
                  </div>
                </div>
                <div className="result-stages">
                  {result.stages.map((s, i) => (
                    <div key={i} className={`result-stage ${s.success ? 'ok' : 'fail'}`}>
                      <span>{s.stage}</span>
                      <span>
                        {(s.duration / 1000).toFixed(1)}s {s.success ? '✓' : '✗'}
                      </span>
                      {!s.success && s.message && <div className="stage-error">{s.message}</div>}
                    </div>
                  ))}
                </div>
                {result.success && (
                  <Link href={`/characters/${result.characterId}`} className="btn-primary">
                    查看角色
                  </Link>
                )}
              </div>
            )
          )}
          <button onClick={handleReset} className="btn-secondary" style={{ marginTop: '1rem' }}>
            收集新角色
          </button>
        </div>
      )}
    </div>
  );
}
