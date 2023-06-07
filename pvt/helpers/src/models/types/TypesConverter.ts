import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { toNormalizedWeights } from '@balancer-labs/balancer-js';
import { ethers } from 'ethers';

import { BigNumberish, bn, fp, FP_100_PCT, FP_ZERO } from '../../numbers';
import { DAY, MONTH } from '../../time';
import { ZERO_ADDRESS } from '../../constants';
import TokenList from '../tokens/TokenList';
import { Account } from './types';
import { ProtocolFee, RawVaultDeployment, VaultDeployment } from '../vault/types';
import {
  RawTokenApproval,
  RawTokenMint,
  RawTokensDeployment,
  TokenApproval,
  TokenMint,
  TokenDeployment,
  RawTokenDeployment,
} from '../tokens/types';
import {
  RawSafeguardPoolDeployment,
  SafeguardPoolDeployment,
  InitialOracleParams,
  InitialSafeguardParams
} from '../pools/safeguard/types';

export function computeDecimalsFromIndex(i: number): number {
  // Produces repeating series (0..18)
  return i % 19;
}

export default {
  toVaultDeployment(params: RawVaultDeployment): VaultDeployment {
    let { mocked, admin, pauseWindowDuration, bufferPeriodDuration, maxYieldValue, maxAUMValue } = params;
    if (!mocked) mocked = false;
    if (!admin) admin = params.from;
    if (!pauseWindowDuration) pauseWindowDuration = 0;
    if (!bufferPeriodDuration) bufferPeriodDuration = 0;
    if (!maxYieldValue) maxYieldValue = FP_100_PCT;
    if (!maxAUMValue) maxAUMValue = FP_100_PCT;
    return { mocked, admin, pauseWindowDuration, bufferPeriodDuration, maxYieldValue, maxAUMValue };
  },

  toRawVaultDeployment(params: RawSafeguardPoolDeployment): RawVaultDeployment {
    let { admin, pauseWindowDuration, bufferPeriodDuration } = params;
    if (!admin) admin = params.from;
    if (!pauseWindowDuration) pauseWindowDuration = 0;
    if (!bufferPeriodDuration) bufferPeriodDuration = 0;

    const mocked = params.fromFactory !== undefined ? !params.fromFactory : true;
    return { mocked, admin, pauseWindowDuration, bufferPeriodDuration };
  },

  toSafeguardPoolDeployment(params: RawSafeguardPoolDeployment): SafeguardPoolDeployment {
    let {
      tokens,
      oracles,
      maxOracleTimeouts,
      stableTokens,
      flexibleOracles,
      assetManagers,
      pauseWindowDuration,
      bufferPeriodDuration,
      signer,
      maxPerfDev,
      maxTargetDev,
      maxPriceDev,
      perfUpdateInterval,
      yearlyFees,
      mustAllowlistLPs,
    } = params;
    if (!params.owner) params.owner = ZERO_ADDRESS;
    if (!tokens) tokens = new TokenList();
    if (!oracles) oracles = Array(tokens.length).fill(ZERO_ADDRESS);
    if (!maxOracleTimeouts) maxOracleTimeouts = Array(tokens.length).fill(1 * DAY);
    if (!stableTokens) stableTokens = Array(tokens.length).fill(true);
    if (!flexibleOracles) flexibleOracles = Array(tokens.length).fill(false);
    if (!pauseWindowDuration) pauseWindowDuration = 3 * MONTH;
    if (!bufferPeriodDuration) bufferPeriodDuration = MONTH;
    if (!assetManagers) assetManagers = Array(tokens.length).fill(ZERO_ADDRESS);
    if(!maxPerfDev) maxPerfDev = fp(0.1);
    if(!maxTargetDev) maxTargetDev = fp(0.2);
    if(!perfUpdateInterval) perfUpdateInterval = 1 * DAY;
    if(!yearlyFees) yearlyFees = 0;
    if (undefined == mustAllowlistLPs) mustAllowlistLPs = false;
    
    let oracleParameters : InitialOracleParams[] = tokens.map((t, i) => {
      return {
        oracle: oracles![i],
        maxTimeout: maxOracleTimeouts![i],
        isStable: stableTokens![i],
        isFlexibleOracle: flexibleOracles![i]
      }
    });

    let safeguardParameters: InitialSafeguardParams = {
      signer: signer,
      maxPerfDev: maxPerfDev,
      maxTargetDev: maxTargetDev,
      perfUpdateInterval: perfUpdateInterval,
      maxPriceDev: maxPriceDev,
      yearlyFees: yearlyFees,
      mustAllowlistLPs: mustAllowlistLPs
    };

    return {
      tokens: tokens,
      assetManagers: assetManagers,
      pauseWindowDuration: pauseWindowDuration,
      bufferPeriodDuration: bufferPeriodDuration,
      owner: this.toAddress(params.owner),
      from: params.from,
      oracleParameters: oracleParameters,
      safeguardParameters: safeguardParameters
   };
  },

  /***
   * Converts a raw list of token deployments into a consistent deployment request
   * @param params It can be a number specifying the number of tokens to be deployed, a list of strings denoting the
   * token symbols to be used, or a list of token attributes (decimals, symbol, name).
   * @param from A default signer can be specified as the deployer address of the entire list, otherwise a single
   * signer per token can be defined.
   */
  toTokenDeployments(params: RawTokensDeployment, from?: SignerWithAddress, varyDecimals = false): TokenDeployment[] {
    params = typeof params === 'number' ? Array(params).fill({}) : params;
    if (!Array.isArray(params)) params = [params];

    return params.map((param, i) => {
      if (typeof param === 'string') param = { symbol: param, from };
      const args = Object.assign(
        {},
        { symbol: `TK${i}`, name: `Token ${i}`, decimals: varyDecimals ? computeDecimalsFromIndex(i) : 18, from },
        param
      );
      return this.toTokenDeployment(args);
    });
  },

  /***
   * Converts a raw token deployment into a consistent deployment request
   * @param params Could be a single string denoting the token symbol or optional token attributes (decimals, symbol, name)
   */
  toTokenDeployment(params: RawTokenDeployment): TokenDeployment {
    if (typeof params === 'string') params = { symbol: params };
    const { name, symbol, decimals, from } = params;
    return {
      from,
      name: name ?? `Token`,
      symbol: symbol ?? `TKN`,
      decimals: decimals ?? 18,
    };
  },

  /***
   * Converts a raw token mint param into a consistent minting list
   */
  toTokenMints(params: RawTokenMint): TokenMint[] {
    if (Array.isArray(params)) return params.flatMap(this.toTokenMints);

    const { to, amount, from } = params;

    if (!Array.isArray(to)) {
      if (Array.isArray(from)) throw Error('Inconsistent mint sender length');
      return [{ to, amount, from }];
    }

    if (Array.isArray(from) && to.length !== from.length) throw Error('Inconsistent mint sender length');
    return to.map((to, i) => ({ to, amount, from: Array.isArray(from) ? from[i] : from }));
  },

  /***
   * Converts a raw token approval param into a consistent approval list
   */
  toTokenApprovals(params: RawTokenApproval): TokenApproval[] {
    if (Array.isArray(params)) return params.flatMap(this.toTokenApprovals);

    const { to: recipients, amount, from } = params;
    const to = Array.isArray(recipients) ? recipients : [recipients];

    return to.flatMap((to) =>
      Array.isArray(from) ? from.map((from) => ({ to, amount, from })) : [{ to, amount, from }]
    );
  },

  toAddresses(to: Account[]): string[] {
    return to.map(this.toAddress);
  },

  toAddress(to?: Account): string {
    if (!to) return ZERO_ADDRESS;
    return typeof to === 'string' ? to : to.address;
  },

  toBytes32(value: BigNumberish): string {
    const hexy = ethers.utils.hexlify(value);
    return ethers.utils.hexZeroPad(hexy, 32);
  },

  toEncodedBasePoolRights(basePoolRights: BasePoolRights): string {
    let value = 0;

    if (basePoolRights.canTransferOwnership) {
      value += 1;
    }
    if (basePoolRights.canChangeSwapFee) {
      value += 2;
    }
    if (basePoolRights.canUpdateMetadata) {
      value += 4;
    }

    return this.toBytes32(value);
  },
};
