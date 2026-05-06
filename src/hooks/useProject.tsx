'use client'
// src/hooks/useProject.ts
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { Project } from '@/types/database'

const KEY = 'pcs:activeProjectId'
interface ProjectContextValue { activeProject:Project|null; activeProjectId:string|null; setActiveProject:(p:Project|null)=>void }
const ProjectContext = createContext<ProjectContextValue|null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [activeProject, setActiveProjectState] = useState<Project|null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(KEY)
    if (stored) { try { setActiveProjectState(JSON.parse(stored)) } catch { localStorage.removeItem(KEY) } }
  }, [])

  const setActiveProject = useCallback((project: Project|null) => {
    setActiveProjectState(project)
    if (project) localStorage.setItem(KEY, JSON.stringify(project))
    else localStorage.removeItem(KEY)
  }, [])

  return <ProjectContext.Provider value={{ activeProject, activeProjectId: activeProject?.id ?? null, setActiveProject }}>{children}</ProjectContext.Provider>
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used inside <ProjectProvider>')
  return ctx
}
