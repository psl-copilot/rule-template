// SPDX-License-Identifier: Apache-2.0

import { aql, type DatabaseManagerInstance, type LoggerService } from '@tazama-lf/frms-coe-lib';
import type { RuleConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import type { RuleExecutorConfig } from './rule-901';
import NodeCache from 'node-cache';

export interface TenantRuleConfig extends RuleConfig {
  tenantId: string;
}

export class TenantConfigManager {
  private readonly cache: NodeCache;
  private readonly databaseManager: DatabaseManagerInstance<RuleExecutorConfig>;
  private readonly loggerService: LoggerService;

  static readonly DEFAULT_CACHE_TTL = 600; // 10 minutes
  static readonly DEFAULT_CHECK_PERIOD = 120; // 2 minutes
  static readonly FIRST_BATCH_INDEX = 0;
  static readonly FIRST_CONFIG_INDEX = 0;

  constructor(
    databaseManager: DatabaseManagerInstance<RuleExecutorConfig>,
    loggerService: LoggerService,
    cacheConfig?: { ttl?: number; checkperiod?: number },
  ) {
    this.databaseManager = databaseManager;
    this.loggerService = loggerService;
    this.cache = new NodeCache({
      stdTTL: cacheConfig?.ttl ?? TenantConfigManager.DEFAULT_CACHE_TTL,
      checkperiod: cacheConfig?.checkperiod ?? TenantConfigManager.DEFAULT_CHECK_PERIOD,
    });
  }

  /**
   * Retrieves tenant-specific rule configuration from cache or database
   * @param tenantId - The tenant identifier
   * @param ruleId - The rule identifier (e.g., "901@1.0.0")
   * @returns Promise<TenantRuleConfig | null>
   */
  async getTenantRuleConfig(tenantId: string, ruleId: string): Promise<TenantRuleConfig | null> {
    const context = 'TenantConfigManager.getTenantRuleConfig()';
    const cacheKey = `${tenantId}:${ruleId}`;

    try {
      // First, try to get from cache
      const cachedConfig = this.cache.get<TenantRuleConfig>(cacheKey);
      if (cachedConfig) {
        this.loggerService.trace(`Retrieved rule config from cache for tenant: ${tenantId}, rule: ${ruleId}`, context);
        return cachedConfig;
      }

      // If not in cache, retrieve from database
      this.loggerService.trace(`Cache miss, retrieving rule config from database for tenant: ${tenantId}, rule: ${ruleId}`, context);

      const tenantIdAql = aql`${tenantId}`;
      const ruleIdAql = aql`${ruleId}`;

      const queryString = aql`FOR config IN ruleConfiguration
        FILTER config.tenantId == ${tenantIdAql}
        AND config.id == ${ruleIdAql}
        RETURN config`;

      // Type-safe database query
      const db = this.databaseManager as DatabaseManagerInstance<RuleExecutorConfig> & {
        _configurationDb: { query: (query: unknown) => Promise<{ batches: { all: () => Promise<TenantRuleConfig[][]> } }> };
      };

      const result = await db._configurationDb.query(queryString);
      const configs = await result.batches.all();

      const FIRST_BATCH = TenantConfigManager.FIRST_BATCH_INDEX;
      const FIRST_CONFIG = TenantConfigManager.FIRST_CONFIG_INDEX;
      if (!configs?.length || !configs[FIRST_BATCH]?.length) {
        this.loggerService.warn(`No rule configuration found for tenant: ${tenantId}, rule: ${ruleId}`, context);
        return null;
      }

      const config = configs[FIRST_BATCH][FIRST_CONFIG];

      // Cache the configuration
      this.cache.set(cacheKey, config);
      this.loggerService.trace(`Cached rule config for tenant: ${tenantId}, rule: ${ruleId}`, context);

      return config;
    } catch (error) {
      this.loggerService.error(`Error retrieving tenant rule config: ${String(error)}`, context);
      throw error;
    }
  }

  /**
   * Stores or updates tenant-specific rule configuration in database and cache
   * @param config - The tenant rule configuration to store
   * @returns Promise<boolean>
   */
  async setTenantRuleConfig(config: TenantRuleConfig): Promise<boolean> {
    const context = 'TenantConfigManager.setTenantRuleConfig()';
    const cacheKey = `${config.tenantId}:${config.id}`;

    try {
      // Type-safe database operation
      const db = this.databaseManager as DatabaseManagerInstance<RuleExecutorConfig> & {
        _configurationDb: { collection: (name: string) => { save: (data: TenantRuleConfig) => Promise<unknown> } };
      };

      // Store in database
      await db._configurationDb.collection('ruleConfiguration').save(config);

      // Update cache
      this.cache.set(cacheKey, config);

      this.loggerService.trace(`Stored rule config for tenant: ${config.tenantId}, rule: ${config.id}`, context);
      return true;
    } catch (error) {
      this.loggerService.error(`Error storing tenant rule config: ${String(error)}`, context);
      throw error;
    }
  }

  /**
   * Removes tenant-specific rule configuration from cache
   * @param tenantId - The tenant identifier
   * @param ruleId - The rule identifier
   */
  invalidateCache(tenantId: string, ruleId: string): void {
    const cacheKey = `${tenantId}:${ruleId}`;
    this.cache.del(cacheKey);
    this.loggerService.trace(`Invalidated cache for tenant: ${tenantId}, rule: ${ruleId}`, 'TenantConfigManager.invalidateCache()');
  }

  /**
   * Clears all cached configurations for a specific tenant
   * @param tenantId - The tenant identifier
   */
  clearTenantCache(tenantId: string): void {
    const keys = this.cache.keys();
    const tenantKeys = keys.filter((key) => key.startsWith(`${tenantId}:`));

    tenantKeys.forEach((key) => this.cache.del(key));
    this.loggerService.trace(`Cleared all cached configs for tenant: ${tenantId}`, 'TenantConfigManager.clearTenantCache()');
  }

  /**
   * Gets cache statistics
   * @returns object with cache statistics
   */
  getCacheStats(): { keys: number; hits: number; misses: number; ksize: number; vsize: number } {
    return this.cache.getStats();
  }
}
