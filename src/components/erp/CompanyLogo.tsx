'use client'
// src/components/erp/CompanyLogo.tsx
// Renders the company logo. Falls back to a styled letter icon if logo_url is missing.

import type { CompanyProfile } from '@/hooks/useCompanyProfile'

interface CompanyLogoProps {
  profile: CompanyProfile
  size?: number          // px, default 32
  showName?: boolean     // show company name next to logo
  variant?: 'sidebar' | 'login' | 'header' | 'pdf'
}

export function CompanyLogo({
  profile,
  size = 32,
  showName = false,
  variant = 'sidebar',
}: CompanyLogoProps) {
  const letter = (profile.company_name ?? 'B').charAt(0).toUpperCase()
  const radius = variant === 'login' ? Math.round(size * 0.3) : Math.round(size * 0.22)

  const logoNode = profile.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={profile.logo_url}
      alt={profile.company_name}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        objectFit: 'contain',
        flexShrink: 0,
      }}
      onError={(e) => {
        // If logo fails to load, hide img and let the letter fallback show
        ;(e.currentTarget as HTMLImageElement).style.display = 'none'
        const parent = e.currentTarget.parentElement
        if (parent) {
          const fb = parent.querySelector('[data-logo-fallback]') as HTMLElement | null
          if (fb) fb.style.display = 'flex'
        }
      }}
    />
  ) : null

  const fallback = (
    <div
      data-logo-fallback
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: '#1D9E75',
        display: profile.logo_url ? 'none' : 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: Math.round(size * 0.44),
        fontWeight: 700,
        flexShrink: 0,
        letterSpacing: '-0.02em',
      }}
    >
      {letter}
    </div>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: showName ? 10 : 0 }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        {logoNode}
        {fallback}
      </div>
      {showName && (
        <div style={{ overflow: 'hidden' }}>
          <div
            style={{
              fontSize: variant === 'login' ? 20 : variant === 'header' ? 15 : 13,
              fontWeight: 600,
              color: variant === 'login' ? '#1a1a1a' : '#1a1a1a',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.2,
            }}
          >
            {profile.company_name}
          </div>
          {variant === 'sidebar' && (
            <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>
              Construction ERP
            </div>
          )}
        </div>
      )}
    </div>
  )
}
