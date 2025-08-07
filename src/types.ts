// SPDX-License-Identifier: Apache-2.0

/**
 * Type extensions for tenant-specific functionality
 */

import type { RuleRequest as BaseRuleRequest } from '@tazama-lf/frms-coe-lib/lib/interfaces';

/**
 * Extended RuleRequest interface that includes TenantId for multi-tenant support
 */
export interface TenantRuleRequest extends BaseRuleRequest {
  /**
   * Tenant identifier for multi-tenant data isolation
   */
  TenantId: string;
}

/**
 * Type guard to check if a RuleRequest has TenantId
 */
export function isTenantsRuleRequest(req: BaseRuleRequest): req is TenantRuleRequest {
  return 'TenantId' in req && typeof (req as TenantRuleRequest).TenantId === 'string';
}

/**
 * Ensures a RuleRequest has TenantId, throws error if not
 */
export function ensureTenantRuleRequest(req: BaseRuleRequest): TenantRuleRequest {
  if (!isTenantsRuleRequest(req)) {
    throw new Error('TenantId not provided in request');
  }
  return req;
}
