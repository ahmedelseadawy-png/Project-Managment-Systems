// src/app/layout.tsx
import type { Metadata } from 'next'
import { QueryProvider } from '@/lib/query-provider'
import { AuthProvider } from '@/hooks/useAuth'
import { ProjectProvider } from '@/hooks/useProject'
import './globals.css'

export const metadata: Metadata = {
  title: 'Project Controls System',
  description: 'Construction ERP — BOQ, Certificates, Technical Office, Procurement',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <QueryProvider>
          <AuthProvider>
            <ProjectProvider>
              {children}
            </ProjectProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
