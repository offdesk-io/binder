import { Alert, Column, Tag } from '@tiagopedras/tenon'
import { useEffect } from 'react'
import { api } from '../../api/endpoints'
import type { BenchTask } from '../../api/types'
import { Loading } from '../../components/Loading'
import { clock, day, safeHref } from '../../lib/format'
import { useApi } from '../../lib/useApi'

/** While a refresh runs, the page asks again this often... */
export const WORK_RELOAD_MS = 3000
/** ...and stops asking this long after it started, which is longer than Bench's 10s timeout. */
export const WORK_STOP_MS = 20000

interface Props {
  orgId: number
  slug: string
  reloadMs?: number
  stopMs?: number
}

function caption(task: BenchTask, finished: boolean): string {
  if (task.cancelled) return task.done_on ? `Cancelled ${day(task.done_on)}` : 'Cancelled'
  if (finished) return `Done ${day(task.done_on)}`
  return [task.due && `Due ${day(task.due)}`, task.assignee].filter(Boolean).join(' · ')
}

function TaskLine({ task, finished }: { task: BenchTask; finished: boolean }) {
  const href = safeHref(task.url) ?? undefined
  const text = caption(task, finished)
  return (
    <li>
      <a href={href} target="_blank" rel="noopener noreferrer">{task.title}</a>
      {!finished && <Tag>{task.state}</Tag>}
      {text && <div className="tenon-caption tn-custom-faint">{text}</div>}
    </li>
  )
}

export function WorkSection({ orgId, slug, reloadMs = WORK_RELOAD_MS, stopMs = WORK_STOP_MS }: Props) {
  const work = useApi(() => api.work(orgId), [orgId])
  const reload = work.reload
  const refreshing = work.data?.refreshing === true
  // While the server is refreshing Bench, ask again every few seconds, and give up after stopMs in all.
  useEffect(() => {
    if (!refreshing) return
    const every = setInterval(reload, reloadMs)
    const stop = setTimeout(() => clearInterval(every), stopMs)
    return () => {
      clearInterval(every)
      clearTimeout(stop)
    }
  }, [refreshing, reloadMs, stopMs, reload])

  const tasks = work.data?.tasks ?? []
  const open = tasks.filter((t) => !t.done && !t.cancelled)
  const done = tasks.filter((t) => t.done || t.cancelled)
  const error = work.data?.error
  const readAt = work.data?.fetched_at

  return (
    <Column titleAs="h2" title="Work">
      {work.error && !work.data ? (
        <Alert tone="error">{work.error.message}</Alert>
      ) : !work.data ? (
        <Loading />
      ) : (
        <div className="tn-stack">
          {error && (
            <Alert tone="warning" title="Could not read Bench">
              {error}
              {readAt && <> Showing what was read at {clock(readAt)}.</>}
            </Alert>
          )}
          {tasks.length === 0 && !error && !readAt && (
            <p className="tenon-body tn-custom-faint">Reading Bench…</p>
          )}
          {tasks.length === 0 && !error && readAt && (
            <p className="tenon-body tn-custom-faint">
              No Bench tasks are tagged with this organisation yet. Add <code className="tenon-code">[lead:: {slug}]</code> to a task in Bench to link it.
            </p>
          )}
          {open.length > 0 && (
            <ul className="tn-custom-tight">
              {open.map((t) => <TaskLine key={t.task_key} task={t} finished={false} />)}
            </ul>
          )}
          {done.length > 0 && (
            <div className="tn-stack">
              <h3 className="tenon-label">Done</h3>
              <ul className="tn-custom-tight">
                {done.map((t) => <TaskLine key={t.task_key} task={t} finished />)}
              </ul>
            </div>
          )}
        </div>
      )}
    </Column>
  )
}
