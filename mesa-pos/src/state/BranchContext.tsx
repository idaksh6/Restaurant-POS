import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  COMPANY_SESSION_EVENT,
  getActiveBranchId,
  hydrateCompanySession,
  loadActiveBranch,
  loadBranches,
  loadCompanyProfile,
  saveBranches,
  saveCompanyProfile,
  setActiveBranchId,
  toCompanyDetails,
  type Branch,
  type CompanyDetails,
  type CompanyProfile,
} from '../data/company'
import { mapApiBranches } from '../lib/branding'
import { useAuth } from './AuthContext'
import { getDeviceId } from '../sync/deviceId'
import { enqueueOutbox, dropPendingUpsertsFor } from '../sync/outbox'
import { companyOutboxOverlay } from '../sync/companyOutbox'
import { apiDeleteBranch, apiMastersReady, apiPutBranch, apiPutCompany } from '../lib/apiMasters'

type BranchContextValue = {
  company: CompanyProfile
  branches: Branch[]
  activeBranch: Branch
  activeBranchId: string
  details: CompanyDetails
  setCompany: (company: CompanyProfile) => void
  upsertBranch: (branch: Branch) => void
  removeBranch: (branchId: string) => void
  switchBranch: (branchId: string) => void
}

const BranchContext = createContext<BranchContextValue | null>(null)

export function BranchProvider({ children }: { children: ReactNode }) {
  const { selectedCompany } = useAuth()
  const [company, setCompanyState] = useState<CompanyProfile>(loadCompanyProfile)
  const [branches, setBranchesState] = useState<Branch[]>(loadBranches)
  const [activeBranchId, setActiveId] = useState(getActiveBranchId)

  useEffect(() => {
    const reload = () => {
      setCompanyState(loadCompanyProfile())
      setBranchesState(loadBranches())
      setActiveId(getActiveBranchId())
    }
    window.addEventListener(COMPANY_SESSION_EVENT, reload)
    return () => window.removeEventListener(COMPANY_SESSION_EVENT, reload)
  }, [])

  useEffect(() => {
    if (!selectedCompany?.id) return
    const profile = loadCompanyProfile()
    const currentBranches = loadBranches()
    const belongs = currentBranches.some((b) => b.companyId === selectedCompany.id)
    const mapped = mapApiBranches(selectedCompany.id, selectedCompany.branches)
    if (profile.id === selectedCompany.id && belongs) return
    hydrateCompanySession(
      {
        ...profile,
        id: selectedCompany.id,
        companyName: selectedCompany.companyName,
        aliasName: selectedCompany.aliasName ?? profile.aliasName,
        taxId: selectedCompany.taxId ?? profile.taxId,
        hqPhone: selectedCompany.hqPhone ?? profile.hqPhone,
        logoDataUrl: selectedCompany.logoDataUrl ?? profile.logoDataUrl,
        enableTax: selectedCompany.enableTax ?? profile.enableTax,
        zatcaEnabled: selectedCompany.zatcaEnabled ?? profile.zatcaEnabled,
        currency: selectedCompany.currency ?? profile.currency,
      },
      mapped.length ? mapped : [],
      companyOutboxOverlay(),
    )
  }, [selectedCompany])

  const activeBranch = useMemo(
    () => branches.find((b) => b.id === activeBranchId) ?? loadActiveBranch(),
    [branches, activeBranchId],
  )

  const details = useMemo(
    () => toCompanyDetails(company, activeBranch),
    [company, activeBranch],
  )

  const setCompany = useCallback((next: CompanyProfile) => {
    saveCompanyProfile(next)
    setCompanyState(next)
    if (apiMastersReady()) {
      void apiPutCompany(next)
        .then(() => dropPendingUpsertsFor(next.id, 'company.upsert'))
        .catch(() => enqueueOutbox('company.upsert', next.id, next, getDeviceId(), null))
    } else {
      enqueueOutbox('company.upsert', next.id, next, getDeviceId(), null)
    }
  }, [])

  const upsertBranch = useCallback((branch: Branch) => {
    setBranchesState((prev) => {
      const next = prev.some((b) => b.id === branch.id)
        ? prev.map((b) => (b.id === branch.id ? branch : b))
        : [...prev, branch]
      saveBranches(next)
      return next
    })
    if (apiMastersReady()) {
      void apiPutBranch(branch)
        .then(() => dropPendingUpsertsFor(branch.id, 'branch.upsert'))
        .catch(() => enqueueOutbox('branch.upsert', branch.id, branch, getDeviceId(), branch.id))
    } else {
      enqueueOutbox('branch.upsert', branch.id, branch, getDeviceId(), branch.id)
    }
  }, [])

  const removeBranch = useCallback(
    (branchId: string) => {
      setBranchesState((prev) => {
        if (prev.length <= 1) return prev
        const next = prev.filter((b) => b.id !== branchId)
        saveBranches(next)
        if (activeBranchId === branchId) {
          const fallback = next[0]?.id
          if (fallback) {
            setActiveBranchId(fallback)
            setActiveId(fallback)
          }
        }
        return next
      })
      if (apiMastersReady()) {
        void apiDeleteBranch(branchId).catch(() =>
          enqueueOutbox('branch.delete', branchId, { id: branchId }, getDeviceId(), branchId),
        )
      } else {
        enqueueOutbox('branch.delete', branchId, { id: branchId }, getDeviceId(), branchId)
      }
    },
    [activeBranchId],
  )

  const switchBranch = useCallback((branchId: string) => {
    const exists = loadBranches().some((b) => b.id === branchId && b.active)
    if (!exists) return
    setActiveBranchId(branchId)
    setActiveId(branchId)
  }, [])

  const value = useMemo(
    () => ({
      company,
      branches,
      activeBranch,
      activeBranchId,
      details,
      setCompany,
      upsertBranch,
      removeBranch,
      switchBranch,
    }),
    [
      company,
      branches,
      activeBranch,
      activeBranchId,
      details,
      setCompany,
      upsertBranch,
      removeBranch,
      switchBranch,
    ],
  )

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
}

export function useBranch() {
  const ctx = useContext(BranchContext)
  if (!ctx) throw new Error('useBranch must be used inside BranchProvider')
  return ctx
}
