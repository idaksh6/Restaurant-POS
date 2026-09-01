import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import LoginPage from '../pages/LoginPage'
import { dismissBootSplashAfterPaint } from '../lib/bootSplash'
import { useAuth } from '../state/AuthContext'

export default function RequireAuth() {
  const { user } = useAuth()

  useEffect(() => {
    if (user) dismissBootSplashAfterPaint()
  }, [user])

  if (!user) return <LoginPage />
  return <Outlet />
}
