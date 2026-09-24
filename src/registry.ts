// markets.json: loading, validation (SPECS §6) and lookup.

import { readFileSync } from "node:fs";
import type { Hex } from "viem";
import { chainFamily, parseChainId } from "./chains.ts";
import { KINDS, type Params } from "./kinds.ts";

export const DEFAULT_REGISTRY_PATH = new URL("../markets.json", import.meta.url);

export interface Chain {
  name: string;
}

export interface Protocol {
  name: string;
  description: string;
}

export interface Market {
  chainId: string;
  protocol: string;
  kind: string;
  params: Params;
  name: string;
  description?: string;
  url?: string;
}

export interface Registry {
  schemaVersion: 1;
  chains: Record<string, Chain>;
  protocols: Record<string, Protocol>;
  markets: Market[];
}

export interface Entry {
  marketId: Hex;
  market: Market;
}

export interface ValidationResult {
  errors: string[];
  /** Markets that passed validation, with their derived marketIds. */
  entries: Entry[];
}

const PROTOCOL_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

export function readRegistry(path: string | URL = DEFAULT_REGISTRY_PATH): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reports missing required fields, unknown fields and non-string values. Returns true if the shape is valid. */
function checkFields(
  errors: string[],
  where: string,
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, string> {
  if (!isObject(value)) {
    errors.push(`${where}: must be an object`);
    return false;
  }
  const before = errors.length;
  for (const key of required) {
    if (!(key in value)) errors.push(`${where}: missing required field "${key}"`);
  }
  for (const [key, field] of Object.entries(value)) {
    if (!required.includes(key) && !optional.includes(key)) errors.push(`${where}: unknown field "${key}"`);
    else if (typeof field !== "string" || field.trim() === "") errors.push(`${where}.${key}: must be a non-empty string`);
  }
  return errors.length === before;
}

export function validateRegistry(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const entries: Entry[] = [];

  if (!isObject(raw)) return { errors: ["registry: must be a JSON object"], entries };
  for (const key of Object.keys(raw)) {
    if (!["schemaVersion", "chains", "protocols", "markets"].includes(key)) errors.push(`registry: unknown field "${key}"`);
  }
  if (raw.schemaVersion !== 1) errors.push(`schemaVersion: expected 1, got ${JSON.stringify(raw.schemaVersion)}`);

  const chains = isObject(raw.chains) ? raw.chains : (errors.push("chains: must be an object"), {});
  for (const [id, chain] of Object.entries(chains)) {
    try {
      chainFamily(parseChainId(id));
    } catch (error) {
      errors.push(`chains["${id}"]: ${(error as Error).message}`);
    }
    checkFields(errors, `chains["${id}"]`, chain, ["name"]);
  }

  const protocols = isObject(raw.protocols) ? raw.protocols : (errors.push("protocols: must be an object"), {});
  for (const [key, protocol] of Object.entries(protocols)) {
    if (!PROTOCOL_KEY.test(key)) errors.push(`protocols["${key}"]: name must be lowercase snake_case`);
    checkFields(errors, `protocols["${key}"]`, protocol, ["name", "description"]);
  }

  const markets = Array.isArray(raw.markets) ? raw.markets : (errors.push("markets: must be an array"), []);
  const seen = new Map<string, number>();
  markets.forEach((market: unknown, index) => {
    const label = isObject(market) && typeof market.name === "string" ? ` (${market.name})` : "";
    const where = `markets[${index}]${label}`;
    const { params, ...fields } = isObject(market) ? market : {};
    if (!checkFields(errors, where, isObject(market) ? fields : market, ["chainId", "protocol", "kind", "name"], ["description", "url"])) return;
    if (params === undefined) return void errors.push(`${where}: missing required field "params"`);
    if (!isObject(params)) return void errors.push(`${where}.params: must be an object`);
    const m = market as unknown as Market;

    if (m.url !== undefined && !/^https:\/\/\S+$/.test(m.url)) errors.push(`${where}.url: must be an https URL`);
    if (!Object.hasOwn(protocols, m.protocol)) errors.push(`${where}: protocol "${m.protocol}" is not declared in "protocols"`);
    if (!Object.hasOwn(chains, m.chainId)) errors.push(`${where}: chainId "${m.chainId}" is not declared in "chains"`);

    const kind = KINDS.get(m.kind);
    if (!kind) return void errors.push(`${where}: unknown kind "${m.kind}"`);
    try {
      const family = chainFamily(parseChainId(m.chainId));
      if (family !== kind.family) throw new Error(`kind ${kind.name} is for ${kind.family} chains, but chain ${m.chainId} is ${family}`);
      const marketId = kind.marketId(m.params);
      const key = `${m.chainId}:${marketId}`;
      const other = seen.get(key);
      if (other !== undefined) throw new Error(`same (chainId, marketId) as markets[${other}]: ${key}`);
      seen.set(key, index);
      entries.push({ marketId, market: m });
    } catch (error) {
      errors.push(`${where}: ${(error as Error).message}`);
    }
  });

  return { errors, entries };
}

/** Finds a market by chain and marketId. `marketId` is matched case-insensitively. */
export function findMarket(entries: readonly Entry[], chainId: string, marketId: string): Entry | undefined {
  const id = marketId.toLowerCase();
  return entries.find((entry) => entry.market.chainId === chainId && entry.marketId === id);
}
