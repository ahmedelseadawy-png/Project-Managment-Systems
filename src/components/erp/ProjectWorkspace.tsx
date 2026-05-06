'use client'
// src/components/erp/ProjectWorkspace.tsx
// Project Workspace icon card grid — shown on the Home page after project selection.

interface WorkspaceCard {
  id: string
  label: string
  icon: string
  accent: string
  bg: string
  description?: string
  badge?: string | number
}

interface ProjectWorkspaceProps {
  onNavigate: (viewId: string) => void
  pendingApprovals?: number
  canView?: (moduleKey: string) => boolean
}

const WORKSPACE_CARDS: WorkspaceCard[] = [
  {
    id: 'structure',
    label: 'Project Structure',
    icon: '▦',
    accent: '#0F6E56',
    bg: '#E1F5EE',
    description: 'Phases, buildings & units',
  },
  {
    id: 'boq',
    label: 'BOQ',
    icon: '≡',
    accent: '#185FA5',
    bg: '#E6F1FB',
    description: 'Bill of Quantities',
  },
  {
    id: 'bbs-qs',
    label: 'BBS & QS',
    icon: '▥',
    accent: '#533AB7',
    bg: '#EEEDFE',
    description: 'Quantities & bar schedule',
  },
  {
    id: 'breakdown',
    label: 'Subcontractor Contracts',
    icon: '◉',
    accent: '#993C1D',
    bg: '#FAECE7',
    description: 'Contract management',
  },
  {
    id: 'subcontractor-dashboard',
    label: 'Subcontractor Dashboard',
    icon: '📊',
    accent: '#185FA5',
    bg: '#E6F1FB',
    description: 'Compare progress & buildings',
  },
  {
    id: 'certificates',
    label: 'Subcontractor Invoices',
    icon: '◧',
    accent: '#3B6D11',
    bg: '#EAF3DE',
    description: 'Certificates & payments',
  },
  {
    id: 'procurement',
    label: 'Material Requests',
    icon: '⬡',
    accent: '#854F0B',
    bg: '#FAEEDA',
    description: 'PRs & procurement',
  },
  {
    id: 'inventory',
    label: 'Procurement & Stores',
    icon: '▤',
    accent: '#0F6E56',
    bg: '#E1F5EE',
    description: 'GRN, stock & inventory',
  },
  {
    id: 'technical',
    label: 'RFIs & Technical',
    icon: '📋',
    accent: '#185FA5',
    bg: '#E6F1FB',
    description: 'Technical office records',
  },
  {
    id: 'variations',
    label: 'Daily Reports',
    icon: '📅',
    accent: '#533AB7',
    bg: '#EEEDFE',
    description: 'Progress & site reports',
  },
  {
    id: 'villas',
    label: 'Site Progress',
    icon: '🏗️',
    accent: '#993C1D',
    bg: '#FAECE7',
    description: 'Villa & unit tracker',
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: '💳',
    accent: '#3B6D11',
    bg: '#EAF3DE',
    description: 'Payments & accounting',
  },
  {
    id: 'approval-center',
    label: 'Assigned Approvals',
    icon: '✓',
    accent: '#854F0B',
    bg: '#FAEEDA',
    description: 'My pending actions',
  },
  {
    id: 'commercial',
    label: 'Reports',
    icon: '▣',
    accent: '#185FA5',
    bg: '#E6F1FB',
    description: 'Cost control & reports',
  },
  {
    id: 'approval-matrix',
    label: 'Settings',
    icon: '⚙',
    accent: '#444',
    bg: '#F1EFE8',
    description: 'Approval matrix & config',
  },
]

export function ProjectWorkspace({
  onNavigate,
  pendingApprovals = 0,
  canView,
}: ProjectWorkspaceProps) {
  const visibleCards = WORKSPACE_CARDS.filter((card) => {
    if (!canView) return true
    // Map card id to module key (simple 1:1 for now; V140_04 will refine)
    return canView(card.id)
  })

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
        gap: 12,
      }}
    >
      {visibleCards.map((card) => {
        const badge =
          card.id === 'approval-center' && pendingApprovals > 0
            ? pendingApprovals
            : card.badge

        return (
          <button
            key={card.id}
            onClick={() => onNavigate(card.id)}
            style={{
              border: '0.5px solid #e8e8e0',
              background: '#fff',
              borderRadius: 14,
              padding: '18px 12px 14px',
              cursor: 'pointer',
              textAlign: 'center',
              position: 'relative',
              transition: 'box-shadow 0.15s, border-color 0.15s',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.boxShadow =
                '0 4px 16px rgba(0,0,0,0.09)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = card.accent
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#e8e8e0'
            }}
          >
            {badge !== undefined && Number(badge) > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  background: '#A32D2D',
                  color: '#fff',
                  borderRadius: 20,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 6px',
                  lineHeight: 1.4,
                }}
              >
                {badge}
              </span>
            )}
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 13,
                background: card.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                color: card.accent,
                flexShrink: 0,
              }}
            >
              {card.icon}
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#1a1a1a',
                  lineHeight: 1.3,
                  marginBottom: 3,
                }}
              >
                {card.label}
              </div>
              {card.description && (
                <div style={{ fontSize: 10, color: '#888', lineHeight: 1.3 }}>
                  {card.description}
                </div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
