import { API_TOKEN_ENV_NAME, readApiTokenFileSync } from "./api-auth.js";
import { resolveEnvLoader, type EnvLoaderArgs } from "./env.js";
import { loadHostDaemonPortValue } from "./ports.js";
import {
  BB_LOOPBACK_HOST,
  BB_PROD_HOST_DAEMON_PORT,
  BB_PROD_SERVER_PORT,
  resolveRuntimeDataDir,
} from "./runtime.js";
import { loadServerUrlValue } from "./server-url.js";

export interface CliConfig {
  // Local API token for the target server: BB_API_TOKEN when set, otherwise
  // the api-token file in the data dir. Null when neither exists yet.
  BB_API_TOKEN: string | null;
  BB_HOST_DAEMON_PORT: number;
  BB_SERVER_URL: string;
}

interface LoadCliConfigArgs extends EnvLoaderArgs {
  repoRoot?: string;
}

const DEFAULT_CLI_SERVER_URL = `http://${BB_LOOPBACK_HOST}:${BB_PROD_SERVER_PORT}`;

function hasConfiguredValue(env: NodeJS.ProcessEnv, key: string): boolean {
  return env[key] !== undefined;
}

function loadApiTokenValue(args: {
  env: NodeJS.ProcessEnv;
  homeDir: string;
  mode: "dev" | "prod";
  repoRoot?: string;
}): string | null {
  const fromEnv = args.env[API_TOKEN_ENV_NAME]?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  let dataDir: string;
  try {
    dataDir = resolveRuntimeDataDir({
      env: args.env,
      homeDir: args.homeDir,
      mode: args.mode,
      ...(args.repoRoot === undefined ? {} : { repoRoot: args.repoRoot }),
    });
  } catch {
    // Development mode without a repo root has no data dir to read from;
    // the token then has to arrive through the environment.
    return null;
  }
  return readApiTokenFileSync(dataDir);
}

export function loadCliConfig(args: LoadCliConfigArgs = {}): CliConfig {
  const loader = resolveEnvLoader(args);
  const useDevDefaults = loader.mode === "dev" && args.repoRoot !== undefined;
  const serverUrl =
    hasConfiguredValue(loader.env, "BB_SERVER_URL") || useDevDefaults
      ? loadServerUrlValue({
          ...args,
          env: loader.env,
          homeDir: loader.context.homeDir,
          mode: loader.mode,
        })
      : loadServerUrlValue({
          ...args,
          env: loader.env,
          homeDir: loader.context.homeDir,
          mode: loader.mode,
          serverUrl: DEFAULT_CLI_SERVER_URL,
        });

  return {
    BB_API_TOKEN: loadApiTokenValue({
      env: loader.env,
      homeDir: loader.context.homeDir,
      mode: loader.mode,
      ...(args.repoRoot === undefined ? {} : { repoRoot: args.repoRoot }),
    }),
    BB_HOST_DAEMON_PORT:
      hasConfiguredValue(loader.env, "BB_HOST_DAEMON_PORT") || useDevDefaults
        ? loadHostDaemonPortValue({
            ...args,
            env: loader.env,
            homeDir: loader.context.homeDir,
            mode: loader.mode,
          })
        : BB_PROD_HOST_DAEMON_PORT,
    BB_SERVER_URL: serverUrl,
  };
}
