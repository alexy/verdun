export type VerdunAccountTier = 'free' | 'buyer' | 'pro' | 'admin'

export type VerdunAccountStatus = 'active' | 'suspended'

export const verdunAccountTiers = ['free', 'buyer', 'pro', 'admin'] as const satisfies readonly VerdunAccountTier[]

export const verdunAccountStatuses = ['active', 'suspended'] as const satisfies readonly VerdunAccountStatus[]

export type VerdunAccount = {
  id: string
  email: string
  name: string | null
  pictureUrl: string | null
  provider: 'google'
  providerSubject: string
  tier: VerdunAccountTier
  status: VerdunAccountStatus
  createdAt: string
  updatedAt: string
  lastLoginAt: string | null
}

export type VerdunPublicAccount = Omit<VerdunAccount, 'providerSubject'>

export type VerdunAccountSession = {
  token: string
  accountId: string
  expiresAt: string
}

export type VerdunUsageWindow = {
  accountId: string
  capability: string
  windowStart: string
  used: number
  limit: number | null
  remaining: number | null
  unlimited: boolean
}

export type VerdunTierCapabilities = {
  tier: VerdunAccountTier
  dailyInspectionsLimit: number | null
  canSaveFavorites: boolean
  canCompareSaved: boolean
  canContactOwners: boolean
  isAdmin: boolean
}

export const verdunTierCapabilities: Record<VerdunAccountTier, VerdunTierCapabilities> = {
  free: {
    tier: 'free',
    dailyInspectionsLimit: 3,
    canSaveFavorites: false,
    canCompareSaved: false,
    canContactOwners: false,
    isAdmin: false,
  },
  buyer: {
    tier: 'buyer',
    dailyInspectionsLimit: null,
    canSaveFavorites: true,
    canCompareSaved: true,
    canContactOwners: false,
    isAdmin: false,
  },
  pro: {
    tier: 'pro',
    dailyInspectionsLimit: null,
    canSaveFavorites: true,
    canCompareSaved: true,
    canContactOwners: true,
    isAdmin: false,
  },
  admin: {
    tier: 'admin',
    dailyInspectionsLimit: null,
    canSaveFavorites: true,
    canCompareSaved: true,
    canContactOwners: true,
    isAdmin: true,
  },
}

export function verdunCapabilitiesForTier(tier: VerdunAccountTier): VerdunTierCapabilities {
  return verdunTierCapabilities[tier] ?? verdunTierCapabilities.free
}

export function isVerdunAccountTier(value: unknown): value is VerdunAccountTier {
  return typeof value === 'string' && verdunAccountTiers.includes(value as VerdunAccountTier)
}

export function isVerdunAccountStatus(value: unknown): value is VerdunAccountStatus {
  return typeof value === 'string' && verdunAccountStatuses.includes(value as VerdunAccountStatus)
}

export function verdunPublicAccount(account: VerdunAccount): VerdunPublicAccount {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    pictureUrl: account.pictureUrl,
    provider: account.provider,
    tier: account.tier,
    status: account.status,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    lastLoginAt: account.lastLoginAt,
  }
}
