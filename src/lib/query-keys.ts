// src/lib/query-keys.ts
export const qk = {
  projects:       { all: () => ['projects'] as const, list: () => ['projects','list'] as const, detail: (id: string) => ['projects','detail',id] as const },
  dashboard:      { kpis: (pid: string) => ['dashboard','kpis',pid] as const },
  subcontractors: { all: () => ['subcontractors'] as const, list: () => ['subcontractors','list'] as const, detail: (id: string) => ['subcontractors','detail',id] as const },
  commercial:     { summary: (pid: string) => ['commercial','summary',pid] as const },
  boq:            { all: () => ['boq'] as const, list: (pid: string) => ['boq','list',pid] as const, detail: (id: string) => ['boq','detail',id] as const },
  breakdown:      { all: () => ['breakdown'] as const, list: (pid: string) => ['breakdown','list',pid] as const, bySub: (pid: string, sid: string) => ['breakdown','sub',pid,sid] as const, detail: (id: string) => ['breakdown','detail',id] as const },
  qs:             { all: () => ['qs'] as const, list: (pid: string) => ['qs','list',pid] as const, bySub: (pid: string, sid: string) => ['qs','sub',pid,sid] as const, byCert: (pid: string, n: number) => ['qs','cert',pid,n] as const, pending: (pid: string) => ['qs','pending',pid] as const, detail: (id: string) => ['qs','detail',id] as const },
  approvals:      { all: () => ['approvals'] as const, list: (pid: string) => ['approvals','list',pid] as const },
  certificates:   { all: () => ['certificates'] as const, list: (pid: string) => ['certificates','list',pid] as const, bySub: (pid: string, sid: string) => ['certificates','sub',pid,sid] as const, detail: (id: string) => ['certificates','detail',id] as const, lines: (cid: string) => ['certificates','lines',cid] as const, summary: (pid: string) => ['certificates','summary',pid] as const },
  technical:      { all: () => ['technical'] as const, list: (pid: string) => ['technical','list',pid] as const, overdue: (pid: string) => ['technical','overdue',pid] as const, detail: (id: string) => ['technical','detail',id] as const },
  procurement:    { all: () => ['procurement'] as const, list: (pid: string) => ['procurement','list',pid] as const, delayed: (pid: string) => ['procurement','delayed',pid] as const, detail: (id: string) => ['procurement','detail',id] as const },
  variations:     { all: () => ['variations'] as const, list: (pid: string) => ['variations','list',pid] as const, detail: (id: string) => ['variations','detail',id] as const },
}
