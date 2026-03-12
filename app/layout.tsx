import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'QuizDB',
  description: 'NAQT Quiz Bowl Training App',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
