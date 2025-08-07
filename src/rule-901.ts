// SPDX-License-Identifier: Apache-2.0

import { aql, type DatabaseManagerInstance, type LoggerService, type ManagerConfig } from '@tazama-lf/frms-coe-lib';
import type { OutcomeResult, RuleConfig, RuleRequest, RuleResult } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { unwrap } from '@tazama-lf/frms-coe-lib/lib/helpers/unwrap';
import { TenantConfigManager } from './tenant-config-manager';
import { ensureTenantRuleRequest } from './types';

export type RuleExecutorConfig = ManagerConfig &
  Required<Pick<ManagerConfig, 'transactionHistory' | 'pseudonyms' | 'configuration' | 'localCacheConfig'>>;

/**
 * Options for handling transactions
 */
export interface HandleTransactionOptions {
  determineOutcome: (value: number, ruleConfig: RuleConfig, ruleResult: RuleResult) => RuleResult;
  ruleRes: RuleResult;
  loggerService: LoggerService;
  ruleConfig: RuleConfig;
  databaseManager: DatabaseManagerInstance<RuleExecutorConfig>;
}

/**
 * Enhanced handleTransaction function with tenant-specific configuration support
 */
export async function handleTransaction(req: RuleRequest, options: HandleTransactionOptions): Promise<RuleResult> {
  const { determineOutcome, ruleRes, loggerService, ruleConfig, databaseManager } = options;
  const context = `Rule-${ruleConfig.id ? ruleConfig.id : '<unresolved>'} handleTransaction()`;
  const msgId = req.transaction.FIToFIPmtSts.GrpHdr.MsgId;

  loggerService.trace('Start - handle transaction', context, msgId);

  // Ensure request has TenantId for tenant-aware processing
  const tenantReq = ensureTenantRuleRequest(req);

  // Throw errors early if something we know we need is not provided - Guard Pattern
  if (!ruleConfig.config.bands?.length) {
    throw new Error('Invalid config provided - bands not provided or empty');
  }
  if (!ruleConfig.config.exitConditions) throw new Error('Invalid config provided - exitConditions not provided');
  if (!ruleConfig.config.parameters) throw new Error('Invalid config provided - parameters not provided');
  if (!ruleConfig.config.parameters.maxQueryRange) throw new Error('Invalid config provided - maxQueryRange parameter not provided');
  if (!tenantReq.DataCache.dbtrAcctId) throw new Error('Data Cache does not have required dbtrAcctId');

  // Step 1: Early exit conditions

  loggerService.trace('Step 1 - Early exit conditions', context, msgId);

  const UnsuccessfulTransaction = ruleConfig.config.exitConditions.find((b: OutcomeResult) => b.subRuleRef === '.x00');

  if (tenantReq.transaction.FIToFIPmtSts.TxInfAndSts.TxSts !== 'ACCC') {
    if (UnsuccessfulTransaction === undefined) throw new Error('Unsuccessful transaction and no exit condition in config');

    return {
      ...ruleRes,
      reason: UnsuccessfulTransaction.reason,
      subRuleRef: UnsuccessfulTransaction.subRuleRef,
    };
  }

  // Step 2: Query Setup

  loggerService.trace('Step 2 - Query setup', context, msgId);

  const currentPacs002TimeFrame = tenantReq.transaction.FIToFIPmtSts.GrpHdr.CreDtTm;
  const debtorAccountId = `accounts/${tenantReq.DataCache.dbtrAcctId}`;
  const debtorAccIdAql = aql`${debtorAccountId}`;
  const tenantIdAql = aql`${tenantReq.TenantId}`;
  const maxQueryRange: number = ruleConfig.config.parameters.maxQueryRange as number;
  const maxQueryRangeAql = aql` AND DATE_TIMESTAMP(${currentPacs002TimeFrame}) - DATE_TIMESTAMP(pacs002.CreDtTm) <= ${maxQueryRange}`;

  const queryString = aql`FOR pacs002 IN transactionRelationship
    FILTER pacs002._to == ${debtorAccIdAql}
    AND pacs002.TxTp == 'pacs.002.001.12'
    ${maxQueryRangeAql}
    AND pacs002.CreDtTm <= ${currentPacs002TimeFrame}
    AND pacs002.TenantId == ${tenantIdAql}
    COLLECT WITH COUNT INTO length
  RETURN length`;

  // Step 3: Query Execution

  loggerService.trace('Step 3 - Query execution', context, msgId);

  const numberOfRecentTransactions = (await (await databaseManager._pseudonymsDb.query(queryString)).batches.all()) as unknown[][];

  // Step 4: Query post-processing

  loggerService.trace('Step 4 - Query post-processing', context, msgId);

  const count = unwrap(numberOfRecentTransactions);

  if (count == null) {
    // 0 is a legal value
    throw new Error('Data error: irretrievable transaction history');
  }

  if (typeof count !== 'number') {
    throw new Error('Data error: query result type mismatch - expected a number');
  }

  // Return control to the rule-executer for rule result calculation

  loggerService.trace('End - handle transaction', context, msgId);

  return determineOutcome(count, ruleConfig, ruleRes);
}

/**
 * Options for handling transactions with tenant configuration
 */
export interface HandleTransactionWithTenantConfigOptions {
  determineOutcome: (value: number, ruleConfig: RuleConfig, ruleResult: RuleResult) => RuleResult;
  ruleRes: RuleResult;
  loggerService: LoggerService;
  baseRuleId: string;
  databaseManager: DatabaseManagerInstance<RuleExecutorConfig>;
  tenantConfigManager?: TenantConfigManager;
}

/**
 * Handles transaction processing with tenant-specific rule configuration
 * This function retrieves tenant-specific configuration and then processes the transaction
 */
export async function handleTransactionWithTenantConfig(
  req: RuleRequest,
  options: HandleTransactionWithTenantConfigOptions,
): Promise<RuleResult> {
  const { determineOutcome, ruleRes, loggerService, baseRuleId, databaseManager, tenantConfigManager } = options;
  const context = `Rule-${baseRuleId} handleTransactionWithTenantConfig()`;
  const msgId = req.transaction.FIToFIPmtSts.GrpHdr.MsgId;

  loggerService.trace('Start - handle transaction with tenant config', context, msgId);

  // Ensure request has TenantId for tenant-aware processing
  const tenantReq = ensureTenantRuleRequest(req);

  // Initialize tenant config manager if not provided
  const configManager = tenantConfigManager ?? new TenantConfigManager(databaseManager, loggerService);

  // Retrieve tenant-specific rule configuration
  const tenantRuleConfig = await configManager.getTenantRuleConfig(tenantReq.TenantId, baseRuleId);

  if (!tenantRuleConfig) {
    throw new Error(`No rule configuration found for tenant: ${tenantReq.TenantId}, rule: ${baseRuleId}`);
  }

  loggerService.trace(`Using tenant-specific config for tenant: ${tenantReq.TenantId}`, context, msgId);

  // Process transaction using tenant-specific configuration
  return await handleTransaction(req, {
    determineOutcome,
    ruleRes,
    loggerService,
    ruleConfig: tenantRuleConfig,
    databaseManager,
  });
}
