import { defineRpcContract } from "@get-bb/plugin-sdk";
import { experimental_useRpcKeyedQuery } from "@get-bb/plugin-sdk/app";
import { z } from "zod";

const GITHUB_PR_STATUS_PLUGIN_ID = "bb--github-pr-status";

const threadRowPullRequestSchema = z.object({
  number: z.number(),
  state: z.enum(["draft", "open", "merged", "closed"]),
});

export type ThreadRowPullRequest = z.infer<typeof threadRowPullRequestSchema>;

export const githubPrStatusContract = defineRpcContract({
  pullRequests: {
    input: z.object({ keys: z.array(z.string()) }),
    output: z.record(
      z.string(),
      z.discriminatedUnion("outcome", [
        z.object({
          outcome: z.literal("available"),
          pullRequest: threadRowPullRequestSchema,
        }),
        z.object({ outcome: z.literal("absent") }),
        z.object({ outcome: z.literal("unavailable"), message: z.string() }),
      ]),
    ),
  },
});

export function useThreadRowPullRequest(
  environmentId: string,
): ThreadRowPullRequest | null {
  const { data } = experimental_useRpcKeyedQuery({
    pluginId: GITHUB_PR_STATUS_PLUGIN_ID,
    contract: githubPrStatusContract,
    method: "pullRequests",
    keys: [environmentId],
  });
  const row = data?.[environmentId];
  return row?.outcome === "available" ? row.pullRequest : null;
}
