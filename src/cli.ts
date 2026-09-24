// Command-line interface (SPECS §7).
// Exit codes: 0 ok, 1 market not found or registry validation failed, 2 bad input or unusable registry.

import { parseArgs } from "node:util";
import { getAddress, isAddress } from "viem";
import { chainFamily, parseChainId } from "./chains.ts";
import { getKind, type Kind, type Params } from "./kinds.ts";
import { DEFAULT_REGISTRY_PATH, findMarket, readRegistry, validateRegistry, type Entry, type Registry } from "./registry.ts";

const USAGE = `Usage:
  lookup   --chain <chainId> <marketId>
  encode   --chain <chainId> --kind <kind> <params…>
  validate

Params for encode are given in the kind's order, or as name=value pairs.

Options:
  --registry <path>   registry file (default: markets.json at the repo root)
  -h, --help          show this help`;

class UsageError extends Error {}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function loadValidRegistry(path: string | URL): { registry: Registry; entries: Entry[] } {
  const raw = readRegistry(path);
  const { errors, entries } = validateRegistry(raw);
  if (errors.length > 0) throw new Error(`registry is invalid, run "validate" for details (${errors.length} errors)`);
  return { registry: raw as Registry, entries };
}

function describe(registry: Registry, entry: Entry) {
  const { market, marketId } = entry;
  return { marketId, market, protocol: { id: market.protocol, ...registry.protocols[market.protocol] } };
}

/** Maps CLI arguments onto the kind's params. Addresses may be given in lowercase; they are checksummed here. */
function parseParams(kind: Kind, args: string[]): Params {
  const named = args.filter((arg) => arg.includes("="));
  if (named.length !== 0 && named.length !== args.length) throw new UsageError("give params either all positionally or all as name=value");
  if (args.length !== kind.params.length) {
    throw new UsageError(`${kind.name} takes ${kind.params.length} param(s): ${kind.params.join(" ")}`);
  }
  const entries = named.length > 0 ? args.map((arg) => arg.split(/=(.*)/s).slice(0, 2)) : kind.params.map((name, i) => [name, args[i]!]);
  const params: Params = {};
  for (const [name, value] of entries as [string, string][]) {
    if (!kind.params.includes(name)) throw new UsageError(`${kind.name} has no param "${name}", expected: ${kind.params.join(" ")}`);
    if (name in params) throw new UsageError(`param "${name}" given twice`);
    // Only single-case addresses are normalised: mixed case must already carry a valid checksum.
    params[name] = isAddress(value, { strict: true }) ? getAddress(value) : /^0x[0-9a-fA-F]{64}$/.test(value) ? value.toLowerCase() : value;
  }
  return params;
}

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      chain: { type: "string" },
      kind: { type: "string" },
      registry: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, ...rest] = positionals;
  if (values.help || command === undefined) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }
  const registryPath = values.registry ?? DEFAULT_REGISTRY_PATH;

  switch (command) {
    case "lookup": {
      if (values.chain === undefined) throw new UsageError("lookup requires --chain <chainId>");
      if (rest.length !== 1) throw new UsageError("lookup takes exactly one marketId");
      const marketId = rest[0]!;
      if (!/^0x[0-9a-fA-F]{64}$/.test(marketId)) throw new UsageError(`marketId must be 0x followed by 64 hex characters, got "${marketId}"`);
      parseChainId(values.chain);
      const { registry, entries } = loadValidRegistry(registryPath);
      const entry = findMarket(entries, values.chain, marketId);
      if (!entry) {
        console.error(`not found: no market with marketId ${marketId.toLowerCase()} on chain ${values.chain}`);
        return 1;
      }
      print(describe(registry, entry));
      return 0;
    }

    case "encode": {
      if (values.chain === undefined) throw new UsageError("encode requires --chain <chainId>");
      if (values.kind === undefined) throw new UsageError("encode requires --kind <kind>");
      const kind = getKind(values.kind);
      const family = chainFamily(parseChainId(values.chain));
      if (family !== kind.family) throw new UsageError(`kind ${kind.name} is for ${kind.family} chains, but chain ${values.chain} is ${family}`);
      const params = parseParams(kind, rest);
      const marketId = kind.marketId(params);
      const { registry, entries } = loadValidRegistry(registryPath);
      const entry = findMarket(entries, values.chain, marketId);
      print({
        chainId: values.chain,
        kind: kind.name,
        params,
        marketId,
        registered: entry !== undefined,
        ...(entry && { market: entry.market, protocol: describe(registry, entry).protocol }),
      });
      return 0;
    }

    case "validate": {
      const { errors, entries } = validateRegistry(readRegistry(registryPath));
      if (errors.length > 0) {
        for (const error of errors) console.error(error);
        console.error(`\n${errors.length} error(s)`);
        return 1;
      }
      console.log(`ok: ${entries.length} markets`);
      return 0;
    }

    default:
      throw new UsageError(`unknown command "${command}"`);
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(`error: ${(error as Error).message}`);
  if (error instanceof UsageError || (error as { code?: string }).code?.startsWith("ERR_PARSE_ARGS")) {
    console.error(`\n${USAGE}`);
  }
  process.exitCode = 2;
}
