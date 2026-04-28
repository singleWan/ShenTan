'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { categoryLabel, sentimentLabel } from '@/lib/labels';
import { useEventSource } from '@/hooks/useEventSource';
import ConfirmDialog from './ConfirmDialog';

interface EventData {
  id: number;
  title: string;
  description: string | null;
  dateText: string | null;
  dateSortable: string | null;
  category: string;
  importance: number;
}

interface ReactionData {
  id: number;
  reactor: string;
  reactorType: string;
  reactionText: string | null;
  sentiment: string | null;
}

interface TaskState {
  type: 'expand' | 'reaction';
  status: 'starting' | 'running' | 'completed' | 'failed' | 'cancelled';
  logs: Array<{ timestamp: string; message: string }>;
  error?: string;
  taskId?: string;
}

interface TimelineInteractiveProps {
  characterId: number;
  characterName: string;
  characterAliases: string | null;
  eventList: EventData[];
  reactionsMap: Record<number, ReactionData[]>;
}

export default function TimelineInteractive({
  characterId,
  characterName,
  characterAliases,
  eventList,
  reactionsMap,
}: TimelineInteractiveProps) {
  const router = useRouter();
  const [taskStates, setTaskStates] = useState<Map<number, TaskState>>(new Map());
  const [confirmState, setConfirmState] = useState<{ type: 'event' | 'reaction'; id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { connect } = useEventSource();

  const connectSSE = useCallback((url: string, trackKey: number) => {
    connect(url, {
      onLog: (data) => {
        setTaskStates(prev => {
          const next = new Map(prev);
          const current = next.get(trackKey);
          if (!current) return prev;
          next.set(trackKey, {
            ...current,
            status: 'running',
            logs: [...current.logs, { timestamp: data.timestamp, message: data.message }],
          });
          return next;
        });
      },
      onComplete: () => {
        setTaskStates(prev => {
          const next = new Map(prev);
          const current = next.get(trackKey);
          if (current) next.set(trackKey, { ...current, status: 'completed', logs: current.logs });
          return next;
        });
        setTimeout(() => router.refresh(), 500);
      },
      onError: (data) => {
        setTaskStates(prev => {
          const next = new Map(prev);
          const current = next.get(trackKey);
          if (current) next.set(trackKey, { ...current, status: 'failed', error: data.message, logs: current.logs });
          return next;
        });
      },
      onCancelled: () => {
        setTaskStates(prev => {
          const next = new Map(prev);
          const current = next.get(trackKey);
          if (current) next.set(trackKey, { ...current, status: 'cancelled', logs: current.logs });
          return next;
        });
      },
      onConnectionError: () => {
        setTaskStates(prev => {
          const next = new Map(prev);
          const current = next.get(trackKey);
          if (current && (current.status === 'starting' || current.status === 'running')) {
            next.set(trackKey, { ...current, status: 'failed', error: '连接断开' });
          }
          return next;
        });
      },
    });
  }, [connect, router]);

  const handleExpandRange = useCallback(async (
    afterEvent: EventData,
    beforeEvent: EventData,
    targetIdx: number,
  ) => {
    const trackKey = afterEvent.id;

    setTaskStates(prev => {
      const next = new Map(prev);
      next.set(trackKey, { type: 'expand', status: 'starting', logs: [] });
      return next;
    });

    try {
      const res = await fetch('/api/events/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          characterName,
          characterAliases: characterAliases ?? undefined,
          mode: 'range',
          afterEvent: { id: afterEvent.id, title: afterEvent.title, dateText: afterEvent.dateText, dateSortable: afterEvent.dateSortable, description: afterEvent.description },
          beforeEvent: { id: beforeEvent.id, title: beforeEvent.title, dateText: beforeEvent.dateText, dateSortable: beforeEvent.dateSortable, description: beforeEvent.description },
        }),
      });
      const data = await res.json();
      if (data.taskId) {
        setTaskStates(prev => {
          const next = new Map(prev);
          const current = next.get(trackKey);
          if (current) next.set(trackKey, { ...current, taskId: data.taskId });
          return next;
        });
        connectSSE(`/api/events/expand?taskId=${data.taskId}`, trackKey);
      }
    } catch {
      setTaskStates(prev => {
        const next = new Map(prev);
        next.set(trackKey, { type: 'expand', status: 'failed', error: '请求失败', logs: [] });
        return next;
      });
    }
  }, [characterId, characterName, characterAliases, connectSSE]);

  const handleExpandAround = useCallback(async (evt: EventData) => {
    const trackKey = evt.id;

    setTaskStates(prev => {
      const next = new Map(prev);
      next.set(trackKey, { type: 'expand', status: 'starting', logs: [] });
      return next;
    });

    try {
      const res = await fetch('/api/events/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          characterName,
          characterAliases: characterAliases ?? undefined,
          mode: 'around',
          centerEvent: { id: evt.id, title: evt.title, dateText: evt.dateText, dateSortable: evt.dateSortable, description: evt.description, category: evt.category, importance: evt.importance },
        }),
      });
      const data = await res.json();
      if (data.taskId) {
        setTaskStates(prev => {
          const next = new Map(prev);
          const current = next.get(trackKey);
          if (current) next.set(trackKey, { ...current, taskId: data.taskId });
          return next;
        });
        connectSSE(`/api/events/expand?taskId=${data.taskId}`, trackKey);
      }
    } catch {
      setTaskStates(prev => {
        const next = new Map(prev);
        next.set(trackKey, { type: 'expand', status: 'failed', error: '请求失败', logs: [] });
        return next;
      });
    }
  }, [characterId, characterName, characterAliases, connectSSE]);

  const handleCollectReactions = useCallback(async (evt: EventData) => {
    const trackKey = -evt.id;

    setTaskStates(prev => {
      const next = new Map(prev);
      next.set(trackKey, { type: 'reaction', status: 'starting', logs: [] });
      return next;
    });

    try {
      const res = await fetch(`/api/events/${evt.id}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          characterName,
          characterAliases: characterAliases ?? undefined,
          eventContext: {
            title: evt.title,
            description: evt.description,
            dateText: evt.dateText,
            category: evt.category,
            importance: evt.importance,
          },
        }),
      });
      const data = await res.json();
      if (data.taskId) {
        setTaskStates(prev => {
          const next = new Map(prev);
          const current = next.get(trackKey);
          if (current) next.set(trackKey, { ...current, taskId: data.taskId });
          return next;
        });
        connectSSE(`/api/events/${evt.id}/reactions?taskId=${data.taskId}`, trackKey);
      }
    } catch {
      setTaskStates(prev => {
        const next = new Map(prev);
        next.set(trackKey, { type: 'reaction', status: 'failed', error: '请求失败', logs: [] });
        return next;
      });
    }
  }, [characterId, characterName, characterAliases, connectSSE]);

  const isTaskRunning = useCallback((key: number) => {
    const state = taskStates.get(key);
    return state?.status === 'starting' || state?.status === 'running';
  }, [taskStates]);

  const handleCancelTask = useCallback(async (key: number) => {
    const state = taskStates.get(key);
    if (!state?.taskId) return;

    let cancelUrl: string;
    if (state.type === 'expand') {
      cancelUrl = `/api/events/expand?taskId=${state.taskId}`;
    } else {
      const eventId = Math.abs(key);
      cancelUrl = `/api/events/${eventId}/reactions?taskId=${state.taskId}`;
    }

    try {
      await fetch(cancelUrl, { method: 'DELETE' });
    } catch {
      // 取消请求失败，忽略
    }
  }, [taskStates]);

  const handleDeleteEvent = useCallback(async (eventId: number) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } finally {
      setDeleting(false);
      setConfirmState(null);
    }
  }, [router]);

  const handleDeleteReaction = useCallback(async (reactionId: number) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/reactions/${reactionId}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } finally {
      setDeleting(false);
      setConfirmState(null);
    }
  }, [router]);

  return (
    <div className="timeline">
      {eventList.map((evt, idx) => {
        const evtReactions = reactionsMap[evt.id] ?? [];
        const importanceLevel = Math.min(evt.importance, 5);
        const expandTaskKey = evt.id;
        const reactionTaskKey = -evt.id;
        const expandState = taskStates.get(expandTaskKey);
        const reactionState = taskStates.get(reactionTaskKey);

        return (
          <div key={evt.id}>
            {/* 间隔区域 "+" 按钮 */}
            {idx > 0 && (
              <div className="timeline-gap">
                <button
                  className="timeline-expand-btn"
                  onClick={() => handleExpandRange(eventList[idx - 1], evt, idx)}
                  disabled={isTaskRunning(eventList[idx - 1].id)}
                  title={`在 "${eventList[idx - 1].title}" 和 "${evt.title}" 之间搜索事件`}
                >
                  +
                </button>
              </div>
            )}

            {/* 事件节点 */}
            <div className="timeline-item">
              <div className="timeline-node" data-importance={importanceLevel} />
              <div className="event-card hud-card">
                <div className="event-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {evt.dateText && <span className="event-date">{evt.dateText}</span>}
                    <div className="importance-bars">
                      {Array.from({ length: 5 }, (_, i) => (
                        <span
                          key={i}
                          className={`bar ${i < importanceLevel ? 'active' : ''} ${importanceLevel >= 4 ? 'high' : ''}`}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="event-category">{categoryLabel(evt.category)}</span>
                </div>
                <h3>{evt.title}</h3>
                {evt.description && <p className="event-description">{evt.description}</p>}

                {/* 操作按钮 */}
                <div className="event-actions">
                  <button
                    className="event-action-btn"
                    onClick={() => handleExpandAround(evt)}
                    disabled={isTaskRunning(expandTaskKey)}
                  >
                    {isTaskRunning(expandTaskKey) ? '拓展中...' : '拓展事件'}
                  </button>
                  <button
                    className="event-action-btn"
                    onClick={() => handleCollectReactions(evt)}
                    disabled={isTaskRunning(reactionTaskKey)}
                  >
                    {isTaskRunning(reactionTaskKey) ? '收集中...' : '收集反应'}
                  </button>
                  <button
                    className="btn-delete"
                    onClick={() => setConfirmState({ type: 'event', id: evt.id, name: evt.title })}
                  >
                    删除
                  </button>
                </div>

                {/* 拓展任务内联进度 */}
                {expandState && (expandState.status === 'running' || expandState.status === 'starting') && (
                  <div className="inline-progress">
                    <div className="inline-progress-header">
                      <span className="inline-progress-title">正在拓展事件...</span>
                      <button className="inline-cancel-btn" onClick={() => handleCancelTask(expandTaskKey)}>取消</button>
                    </div>
                    <div className="inline-log">
                      {expandState.logs.slice(-5).map((log, i) => (
                        <div key={i} className="log-line muted">
                          <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                          <span className="log-msg">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 拓展完成/失败提示 */}
                {expandState?.status === 'completed' && (
                  <div className="inline-progress">
                    <div className="inline-progress-header">
                      <span className="inline-progress-done">拓展完成 - 正在刷新...</span>
                    </div>
                  </div>
                )}
                {expandState?.status === 'failed' && (
                  <div className="inline-progress">
                    <div className="inline-progress-header">
                      <span className="inline-progress-error">拓展失败: {expandState.error}</span>
                    </div>
                  </div>
                )}
                {expandState?.status === 'cancelled' && (
                  <div className="inline-progress">
                    <div className="inline-progress-header">
                      <span className="inline-progress-cancelled">拓展已取消</span>
                    </div>
                  </div>
                )}

                {/* 反应收集内联进度 */}
                {reactionState && (reactionState.status === 'running' || reactionState.status === 'starting') && (
                  <div className="inline-progress">
                    <div className="inline-progress-header">
                      <span className="inline-progress-title">正在收集各方反应...</span>
                      <button className="inline-cancel-btn" onClick={() => handleCancelTask(reactionTaskKey)}>取消</button>
                    </div>
                    <div className="inline-log">
                      {reactionState.logs.slice(-5).map((log, i) => (
                        <div key={i} className="log-line muted">
                          <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                          <span className="log-msg">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 反应收集完成/失败 */}
                {reactionState?.status === 'completed' && (
                  <div className="inline-progress">
                    <div className="inline-progress-header">
                      <span className="inline-progress-done">反应收集完成 - 正在刷新...</span>
                    </div>
                  </div>
                )}
                {reactionState?.status === 'failed' && (
                  <div className="inline-progress">
                    <div className="inline-progress-header">
                      <span className="inline-progress-error">收集失败: {reactionState.error}</span>
                    </div>
                  </div>
                )}
                {reactionState?.status === 'cancelled' && (
                  <div className="inline-progress">
                    <div className="inline-progress-header">
                      <span className="inline-progress-cancelled">反应收集已取消</span>
                    </div>
                  </div>
                )}

                {/* 已有反应 */}
                {evtReactions.length > 0 && (
                  <div className="reactions">
                    <h4>各方反应 ({evtReactions.length})</h4>
                    {evtReactions.map((r) => (
                      <div key={r.id} className="reaction-item">
                        <div className="reaction-header">
                          <span className="reaction-actor">{r.reactor}</span>
                          <span className={`reaction-sentiment sentiment-${r.sentiment ?? 'neutral'}`}>
                            {sentimentLabel(r.sentiment ?? 'neutral')}
                          </span>
                          <button
                            className="reaction-delete-btn"
                            onClick={() => setConfirmState({ type: 'reaction', id: r.id, name: r.reactor })}
                            title="删除反应"
                          >
                            ×
                          </button>
                        </div>
                        <div className="reaction-text">{r.reactionText}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <ConfirmDialog
        open={confirmState !== null}
        message={
          confirmState?.type === 'event'
            ? `确定要删除事件「${confirmState.name}」及其所有反应数据吗？此操作不可恢复。`
            : `确定要删除「${confirmState?.name}」的反应吗？此操作不可恢复。`
        }
        loading={deleting}
        onConfirm={() => {
          if (confirmState?.type === 'event') {
            handleDeleteEvent(confirmState.id);
          } else if (confirmState?.type === 'reaction') {
            handleDeleteReaction(confirmState.id);
          }
        }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
