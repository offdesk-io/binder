import { Alert, Column, Tag } from '@tiagopedras/tenon'
import { useEffect, useRef } from 'react'
import { api } from '../../api/endpoints'
import type { BenchTask } from '../../api/types'
import { Loading } from '../../components/Loading'
import { clock, day, safeHref } from '../../lib/format'
import { useApi } from '../../lib/useApi'

/** How long to wait before asking again when the server had no read yet. */
export const WORK_RELOAD_MS = 4000

interface Props {
  orgId: number
  slug: string
  reloadMs?: number
}

function TaskLine({ task, done }: { task: BenchTask; done: boolean }) {
  const href = safeHref(task.url) ?? undefined
  const caption = done
    ? `Done ${day(task.done_on)}`
    : [task.due && `Due ${day(task.due)}`, task.assignee].filter(Boolean).join(' · ')
  return (
    <li>
      <a href={href} target="_blank" rel="noopener noreferrer">{task.title}</a>
      {!done && <Tag>{task.state}</Tag>}
      {caption && <div className="tenon-caption tn-custom-faint">{caption}</div>}
    </li>
  )
}

export function WorkSection({ orgId, slug, reloadMs = WORK_RELOAD_MS }: Props) {
  const work = useApi(() => api.work(orgId), [orgId])
  const reloaded = useRef(false)
  // A first read the server has not finished yet: the server started one, so ask again once it has run.
  const pending = work.data !== undefined && work.data.fetched_at === null
  useEffect(() => {
    if (!pending || reloaded.current) return
    const timer = setTimeout(() => {
      reloaded.current = true
      work.reload()
    }, reloadMs)
    return () => clearTimeout(timer)
  }, [pending, reloadMs])

  const tasks = work.data?.tasks ?? []
  const open = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)
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
              {open.map((t) => <TaskLine key={t.task_key} task={t} done={false} />)}
            </ul>
          )}
          {done.length > 0 && (
            <div className="tn-stack">
              <h3 className="tenon-label">Done</h3>
              <ul className="tn-custom-tight">
                {done.map((t) => <TaskLine key={t.task_key} task={t} done />)}
              </ul>
            </div>
          )}
        </div>
      )}
    </Column>
  )
}
