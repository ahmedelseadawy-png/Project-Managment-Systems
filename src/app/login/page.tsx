'use client'
// src/app/login/page.tsx — V140 — adds company branding area with safe fallback

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useCompanyProfile } from '@/hooks/useCompanyProfile'
import { CompanyLogo } from '@/components/erp/CompanyLogo'

function LoginForm() {
  const { signIn, signInMagic, user } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (user) router.replace(params.get('redirectTo') ?? '/dashboard')
  }, [user, router, params])

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await signIn(email, password)
    if (error) setError(error)
    setLoading(false)
  }

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await signInMagic(email)
    if (error) setError(error)
    else setSent(true)
    setLoading(false)
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    border: '0.5px solid #d8d8d0', borderRadius: 8,
    fontSize: 14, outline: 'none', background: '#fff',
    fontFamily: 'inherit',
  }
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 12,
    color: '#555', marginBottom: 6, fontWeight: 600,
  }

  if (sent) {
    return (
      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📧</div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Check your email</div>
        <div style={{ fontSize: 13, color: '#666' }}>
          We sent a sign-in link to <strong>{email}</strong>.
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: '#f1f1ed', borderRadius: 8, padding: 3 }}>
        {(['password', 'magic'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: mode === m ? '#fff' : 'transparent',
              color: mode === m ? '#1D9E75' : '#666',
              fontWeight: mode === m ? 600 : 400,
              fontSize: 12, fontFamily: 'inherit',
              boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {m === 'password' ? 'Password' : 'Magic Link'}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          background: '#FCEBEB', border: '0.5px solid #F09595',
          borderRadius: 8, padding: '10px 12px',
          marginBottom: 16, fontSize: 13, color: '#A32D2D',
        }}>
          {error}
        </div>
      )}

      <form onSubmit={mode === 'password' ? handlePasswordLogin : handleMagicLink}>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Email</label>
          <input
            type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            style={inp}
          />
        </div>
        {mode === 'password' && (
          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Password</label>
            <input
              type="password" required value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={inp}
            />
          </div>
        )}
        {mode === 'magic' && (
          <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
            We&apos;ll send a one-click sign-in link to your email.
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%', padding: '10px',
            background: loading ? '#9FE1CB' : '#1D9E75',
            color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            transition: 'background 0.15s',
          }}
        >
          {loading ? 'Please wait…' : mode === 'password' ? 'Sign in' : 'Send magic link'}
        </button>
      </form>
    </>
  )
}

export default function LoginPage() {
  const { profile } = useCompanyProfile()

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f4f4f0', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Company branding header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <CompanyLogo profile={profile} size={56} variant="login" />
          </div>
          <div style={{
            fontSize: 22, fontWeight: 700,
            color: '#1a1a1a', marginBottom: 4,
          }}>
            {profile.company_name}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#1D9E75', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
            Construction ERP
          </div>
          <div style={{ fontSize: 13, color: '#888' }}>Sign in to your account</div>
        </div>

        {/* Login card */}
        <div style={{
          background: '#fff',
          border: '0.5px solid #e0e0d8',
          borderRadius: 14, padding: '28px 28px 24px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        }}>
          <Suspense fallback={
            <div style={{ textAlign: 'center', padding: 20, color: '#999', fontSize: 13 }}>
              Loading…
            </div>
          }>
            <LoginForm />
          </Suspense>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: '#bbb' }}>
          {profile.company_name} · Construction ERP · V140
        </div>
      </div>
    </div>
  )
}
