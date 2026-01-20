// SPDX-License-Identifier: Apache-2.0

// @ts-expect-error -- module is resolved at runtime, types not available
import { handleTransaction } from './rule';
export { handleTransaction };
