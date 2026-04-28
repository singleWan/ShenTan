'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

interface LogEntry {
  timestamp: string;
  message: string;
}

interface TaskResult {
  characterId?: number;
  success?: boolean;
  totalEvents?: number;
  totalReactions?: number;
  stages?: Array<{ stage: string; success: boolean; duration: number; message?: string }>;
  message?: string;
}

interface TaskDetail extends UnifiedTask {
  logs?: LogEntry[];
}

interface UnifiedTask {
  id: string;
  type: 'collection' | 'expand-events' | 'collect-reactions';
  characterName: string;
  characterId?: number | null;
  status: string;
  progress?: string | null;
  result?: string | null;
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  config?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  collection: '角色收集',
  'expand-events': '事件拓展',
  'collect-reactions': '反应收集',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  starting: '启动中',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const STAGE_LABELS: Record<string, string> = {
  biographer: '生平采集',
  'event-explorer': '事件拓展',
  'statement-collector': '发言收集',
  'reaction-collector': '反应收集',
};

type FilterType = 'all' | 'collection' | 'expand-events' | 'collect-reactions';
type FilterStatus = 'all' | 'running' | 'completed' | 'failed' | 'cancelled';

export default function TasksPage() {
  const [tasks, setTasks] = useState<UnifiedTask[]>([]);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [runningCount, setRunningCount] = useState(0);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'delete' | 'clear' | 'cancel';
    task?: UnifiedTask;
  } | null>(null);

  // 展开的任务详情
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailLogs, setDetailLogs] = useState<LogEntry[]>([]);
  const [detailResult, setDetailResult] = useState<TaskResult | null>(null);
  const detailLogRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterType !== 'all') params.set('type', filterType);
      if (filterStatus !== 'all') params.set('status', filterStatus);

      const res = await fetch(`/api/tasks?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks);
        setRunningCount(data.runningCount);
      }
    } catch {
      // ignore
    }
  }, [filterType, filterStatus]);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  // 自动滚动日志到底部
  useEffect(() => {
    if (detailLogRef.current) {
      detailLogRef.current.scrollTop = detailLogRef.current.scrollHeight;
    }
  }, [detailLogs]);

  // 展开/折叠任务详情
  const toggleExpand = async (taskId: string, taskStatus: string, taskType: string) => {
    // 关闭当前 SSE
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    if (expandedId === taskId) {
      setExpandedId(null);
      setDetailLogs([]);
      setDetailResult(null);
      return;
    }

    setExpandedId(taskId);
    setDetailLogs([]);
    setDetailResult(null);

    // 获取详情
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (res.ok) {
        const detail: TaskDetail = await res.json();
        if (detail.logs) setDetailLogs(detail.logs);
        if (detail.result) {
          try { setDetailResult(JSON.parse(detail.result)); } catch { /* ignore */ }
        }
      }
    } catch {
      // ignore
    }

    // 运行中的任务通过 SSE 实时获取日志
    if (taskStatus === 'starting' || taskStatus === 'running') {
      let sseUrl: string;
      if (taskType === 'collection') {
        sseUrl = `/api/collect?taskId=${taskId}`;
      } else if (taskType === 'expand-events') {
        sseUrl = `/api/events/expand?taskId=${taskId}`;
      } else {
        // reaction tasks - 需要知道 eventId，SSE 通过其他方式处理
        // 暂时不订阅 reaction 的 SSE
        return;
      }

      const es = new EventSource(sseUrl);
      sseRef.current = es;

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          switch (data.type) {
            case 'log':
              setDetailLogs((prev) => [...prev, { timestamp: data.timestamp, message: data.message }]);
              break;
            case 'progress':
              // progress 更新已在列表级别处理
              break;
            case 'complete':
              setDetailResult(data.result);
              es.close();
              sseRef.current = null;
              break;
            case 'error':
            case 'cancelled':
              es.close();
              sseRef.current = null;
              break;
          }
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        es.close();
        sseRef.current = null;
      };
    }
  };

  // 关闭 SSE（组件卸载或展开切换时）
  useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
      }
    };
  }, []);

  const handleCancel = async (taskId: string) => {
    await fetch(`/api/collect?taskId=${taskId}`, { method: 'DELETE' });
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    setConfirmAction(null);
    if (expandedId === taskId) {
      setExpandedId(null);
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    }
    fetchTasks();
  };

  const handleDelete = async (taskId: string) => {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    setConfirmAction(null);
    if (expandedId === taskId) setExpandedId(null);
    fetchTasks();
  };

  const handleRetry = async (taskId: string) => {
    const res = await fetch(`/api/tasks/${taskId}/retry`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setExpandedId(null);
      await fetchTasks();
      // 自动展开新任务
      if (data.taskId) {
        setTimeout(() => toggleExpand(data.taskId, 'starting', 'collection'), 500);
      }
    } else {
      const err = await res.json();
      alert(err.error || '重试失败');
    }
  };

  const handleContinue = async (taskId: string) => {
    const res = await fetch(`/api/tasks/${taskId}/continue`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setExpandedId(null);
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
      await fetchTasks();
      if (data.taskId) {
        setTimeout(() => toggleExpand(data.taskId, 'starting', 'collection'), 500);
      }
    } else {
      const err = await res.json();
      alert(err.error || '继续任务失败');
    }
  };

  const handleClearAll = async () => {
    await fetch('/api/tasks/clear', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statuses: ['completed', 'failed', 'cancelled'] }),
    });
    setConfirmAction(null);
    setExpandedId(null);
    fetchTasks();
  };

  const formatDuration = (start?: string | null, end?: string | null) => {
    if (!start) return '-';
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const seconds = Math.floor((endTime - startTime) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const parseProgress = (progressStr?: string | null) => {
    if (!progressStr) return null;
    try { return JSON.parse(progressStr); } catch { return null; }
  };

  const isRunning = (status: string) => status === 'starting' || status === 'running';

  return (
    <div className="container">
      <Link href="/" className="back-link">← 返回首页</Link>

      <div className="header header-actions">
        <div>
          <h1 className="glitch">任务管理</h1>
          <p className="header-subtitle">
            查看和管理所有后台任务
            {runningCount > 0 && <span className="running-indicator"> · {runningCount} 个运行中</span>}
          </p>
        </div>
        <div className="header-btn-group">
          <Link href="/collect" className="btn-header">+ 新收集</Link>
          {tasks.length > 0 && (
            <button
              className="btn-header btn-danger-outline"
              onClick={() => setConfirmAction({ type: 'clear' })}
            >
              清理历史
            </button>
          )}
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="task-filters">
        <div className="filter-group">
          <span className="filter-label">类型</span>
          {(['all', 'collection', 'expand-events', 'collect-reactions'] as FilterType[]).map((t) => (
            <button
              key={t}
              className={`filter-btn ${filterType === t ? 'active' : ''}`}
              onClick={() => setFilterType(t)}
            >
              {t === 'all' ? '全部' : TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="filter-group">
          <span className="filter-label">状态</span>
          {(['all', 'running', 'completed', 'failed', 'cancelled'] as FilterStatus[]).map((s) => (
            <button
              key={s}
              className={`filter-btn ${filterStatus === s ? 'active' : ''}`}
              onClick={() => setFilterStatus(s)}
            >
              {s === 'all' ? '全部' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* 任务列表 */}
      {tasks.length === 0 ? (
        <div className="empty-state">
          <h2>暂无任务</h2>
          <p>
            <Link href="/collect" className="neon-link">开始收集</Link> 角色信息后，任务将显示在这里
          </p>
        </div>
      ) : (
        <div className="task-list">
          {tasks.map((task) => {
            const progress = parseProgress(task.progress);
            const isExpanded = expandedId === task.id;

            return (
              <div key={task.id} className={`task-card hud-card ${isRunning(task.status) ? 'task-running' : ''} ${isExpanded ? 'task-expanded' : ''}`}>
                {/* 可点击的摘要行 */}
                <div
                  className="task-card-summary"
                  onClick={() => toggleExpand(task.id, task.status, task.type)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') toggleExpand(task.id, task.status, task.type); }}
                >
                  <div className="task-card-header">
                    <div className="task-card-title">
                      <span className={`task-type-badge badge-type-${task.type}`}>
                        {TYPE_LABELS[task.type]}
                      </span>
                      <span className="task-char-name">{task.characterName}</span>
                    </div>
                    <div className="task-card-header-right">
                      <span className={`task-status-badge badge-status-${task.status}`}>
                        {isRunning(task.status) && <span className="badge-dot-running" />}
                        {STATUS_LABELS[task.status] || task.status}
                      </span>
                      <span className={`task-expand-icon ${isExpanded ? 'expanded' : ''}`}>▾</span>
                    </div>
                  </div>

                  {/* 进度条 */}
                  {isRunning(task.status) && progress && (
                    <div className="task-progress" onClick={(e) => e.stopPropagation()}>
                      <div className="progress-bar-container">
                        <div
                          className="progress-bar"
                          style={{ width: `${Math.round(((progress.stageIndex + 1) / progress.totalStages) * 100)}%` }}
                        />
                        <div className="progress-info">
                          <span>{progress.message || progress.stage}</span>
                          {progress.eventsCount !== undefined && <span>事件: {progress.eventsCount}</span>}
                          {progress.roundIndex !== undefined && <span>轮次: {progress.roundIndex}/{progress.maxRounds}</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 元信息 */}
                  <div className="task-meta">
                    <span>耗时: {formatDuration(task.startedAt, task.completedAt)}</span>
                    <span>创建: {new Date(task.createdAt).toLocaleString()}</span>
                  </div>
                </div>

                {/* 展开的详情区域 */}
                {isExpanded && (
                  <div className="task-detail">
                    {/* 操作按钮 */}
                    <div className="task-actions">
                      {isRunning(task.status) && (
                        <button
                          className="btn-task btn-task-cancel"
                          onClick={() => setConfirmAction({ type: 'cancel', task })}
                        >
                          取消
                        </button>
                      )}
                      {task.status === 'completed' && task.characterId && (
                        <Link href={`/characters/${task.characterId}`} className="btn-task btn-task-view">
                          查看角色
                        </Link>
                      )}
                      {task.status === 'failed' && task.type === 'collection' && task.characterId && (
                        <button
                          className="btn-task btn-task-continue"
                          onClick={() => handleContinue(task.id)}
                        >
                          继续
                        </button>
                      )}
                      {task.status === 'failed' && (
                        <button
                          className="btn-task btn-task-retry"
                          onClick={() => handleRetry(task.id)}
                        >
                          重试
                        </button>
                      )}
                      {!isRunning(task.status) && (
                        <button
                          className="btn-task btn-task-delete"
                          onClick={() => setConfirmAction({ type: 'delete', task })}
                        >
                          删除
                        </button>
                      )}
                    </div>

                    {/* 结果详情 */}
                    {detailResult && (
                      <div className="task-detail-result">
                        {detailResult.stages && detailResult.stages.length > 0 && (
                          <div className="task-detail-stages">
                            <div className="task-detail-section-title">阶段详情</div>
                            {detailResult.stages.map((s, i) => (
                              <div key={i} className={`result-stage ${s.success ? 'ok' : 'fail'}`}>
                                <span>{STAGE_LABELS[s.stage] || s.stage}</span>
                                <span>{(s.duration / 1000).toFixed(1)}s {s.success ? '✓' : '✗'}</span>
                                {!s.success && s.message && <div className="stage-error">{s.message}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                        {!detailResult.stages && detailResult.message && (
                          <div className="task-detail-message">{detailResult.message}</div>
                        )}
                      </div>
                    )}

                    {/* 错误信息 */}
                    {task.status === 'failed' && task.error && (
                      <div className="task-error">{task.error}</div>
                    )}

                    {/* 日志终端 */}
                    {(detailLogs.length > 0 || isRunning(task.status)) && (
                      <div className="terminal">
                        <div className="terminal-header">
                          <span className="terminal-dot" />
                          <span className="terminal-dot" />
                          <span className="terminal-dot" />
                          <span className="terminal-title">任务日志</span>
                        </div>
                        <div className="terminal-body" ref={detailLogRef}>
                          {detailLogs.map((log, i) => (
                            <div key={i} className="log-line">
                              <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                              <span className="log-msg">{log.message}</span>
                            </div>
                          ))}
                          {detailLogs.length === 0 && isRunning(task.status) && (
                            <div className="log-line muted">等待日志...</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 确认对话框 */}
      {confirmAction && (
        <div className="confirm-overlay" onClick={() => setConfirmAction(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>
              {confirmAction.type === 'cancel' && '取消任务'}
              {confirmAction.type === 'delete' && '删除任务'}
              {confirmAction.type === 'clear' && '清理历史任务'}
            </h3>
            <p>
              {confirmAction.type === 'cancel' && `确定要取消「${confirmAction.task?.characterName}」的任务吗？`}
              {confirmAction.type === 'delete' && `确定要删除「${confirmAction.task?.characterName}」的任务记录吗？`}
              {confirmAction.type === 'clear' && '确定要清理所有已完成、失败和已取消的任务吗？此操作不可撤销。'}
            </p>
            <div className="confirm-actions">
              <button className="btn-confirm-cancel" onClick={() => setConfirmAction(null)}>取消</button>
              <button
                className="btn-confirm-delete"
                onClick={() => {
                  if (confirmAction.type === 'cancel' && confirmAction.task) {
                    handleCancel(confirmAction.task.id);
                  } else if (confirmAction.type === 'delete' && confirmAction.task) {
                    handleDelete(confirmAction.task.id);
                  } else if (confirmAction.type === 'clear') {
                    handleClearAll();
                  }
                }}
              >
                {confirmAction.type === 'cancel' ? '确认取消' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
