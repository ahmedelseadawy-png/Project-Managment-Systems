'use client'
// src/components/erp/AccessDenied.tsx

interface AccessDeniedProps {
  moduleName?: string
}

export function AccessDenied({ moduleName }: AccessDeniedProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 320,
        padding: 40,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: '#FCEBEB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          marginBottom: 20,
        }}
      >
        🔒
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: '#1a1a1a',
          marginBottom: 8,
        }}
      >
        Access Denied
      </div>
      <div style={{ fontSize: 14, color: '#666', maxWidth: 340, lineHeight: 1.6 }}>
        You do not have permission to access
        {moduleName ? ` the ${moduleName} module` : ' this module'}.
        Contact your system administrator to request access.
      </div>
    </div>
  )
}
