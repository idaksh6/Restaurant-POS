import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { pathAllowed } from '../auth/roles'
import { useAuth } from '../state/AuthContext'
import AccessDenied from './AccessDenied'

export default function RoleRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { pathname } = useLocation()

  if (!user) return <Navigate to="/" replace />
  if (user.role === 'rider' && pathname !== '/rider' && !pathname.startsWith('/rider/')) {
    return <Navigate to="/rider" replace />
  }
  if (!pathAllowed(user.role, pathname)) {
    return <AccessDenied pathname={pathname} />
  }

  return children
}
