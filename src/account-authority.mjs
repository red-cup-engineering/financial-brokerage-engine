import { requireFinancialAccountAuthority } from '@red-cup-engineering/financial-engine';

export function requireBrokerageAccountAuthority(contract, grant) {
  const account = requireFinancialAccountAuthority(contract, grant);
  if (contract.type !== 'PrincipalBrokerageServiceContract' || grant.type !== 'RevocableBrokerageAuthorityGrant'
      || typeof contract.id !== 'string' || !contract.id.trim() || grant.principalContract !== contract.id
      || typeof contract.venue !== 'string' || !contract.venue.trim() || grant.venue !== contract.venue
      || grant.adapter !== contract.venue || grant.revoked !== false) {
    throw new TypeError('current-contract-bound-brokerage-authority-required');
  }
  return Object.freeze({ ...account, venue: contract.venue });
}
