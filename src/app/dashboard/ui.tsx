import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { money } from './lib'

export function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e0e0d8', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: '#f5f5f0', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#777', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  )
}

export function BigMetric({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div style={{ background: tone, color: '#fff', borderRadius: 12, padding: 16, minHeight: 92, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
      <div style={{ fontSize: 11, opacity: 0.95, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

export function MeterRow({ label, value, max, tone = '#1d9e75' }: { label: string; value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: '#666' }}>{label}</span>
        <span style={{ fontWeight: 600 }}>{money(value)}</span>
      </div>
      <div style={{ height: 10, background: '#ecece6', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: tone }} />
      </div>
    </div>
  )
}

export function Badge({ text, tone = 'default' }: { text: string; tone?: 'default' | 'success' | 'warn' | 'danger' }) {
  const colors = {
    default: { bg: '#f1efe8', fg: '#444' },
    success: { bg: '#e1f5ee', fg: '#085041' },
    warn: { bg: '#faeeda', fg: '#633806' },
    danger: { bg: '#fcebeb', fg: '#791f1f' },
  }
  const c = colors[tone]
  return <span style={{ background: c.bg, color: c.fg, borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 600 }}>{text}</span>
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>{children}</div>
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d8d8d0', borderRadius: 8, fontSize: 13, ...(props.style ?? {}) }} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d8d8d0', borderRadius: 8, fontSize: 13, background: '#fff', ...(props.style ?? {}) }} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d8d8d0', borderRadius: 8, fontSize: 13, minHeight: 76, ...(props.style ?? {}) }} />
}

export function Button({ children, tone = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'secondary' | 'danger' }) {
  const palette = {
    primary: { bg: '#1d9e75', fg: '#fff', border: '#1d9e75' },
    secondary: { bg: '#fff', fg: '#333', border: '#d8d8d0' },
    danger: { bg: '#fff3f3', fg: '#9c2d2d', border: '#efc9c9' },
  }
  const c = palette[tone]
  return (
    <button
      {...props}
      style={{
        padding: '8px 12px',
        borderRadius: 8,
        border: `1px solid ${c.border}`,
        background: c.bg,
        color: c.fg,
        fontSize: 13,
        fontWeight: 600,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        opacity: props.disabled ? 0.7 : 1,
        ...(props.style ?? {}),
      }}
    >
      {children}
    </button>
  )
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>{children}</div>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  )
}

export function Table({ heads, rows }: { heads: string[]; rows: ReactNode[][] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e8e8e4', color: '#777', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={heads.length} style={{ padding: 18, textAlign: 'center', color: '#999' }}>No data yet</td>
            </tr>
          ) : rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f1f1ed' }}>
              {row.map((cell, j) => <td key={j} style={{ padding: '9px 10px', verticalAlign: 'top' }}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
