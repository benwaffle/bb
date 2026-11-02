import { describe, expect, it } from "vitest";
import {
  BB_FAVICON_URL,
  MONOGRAM_COLORS,
  parseGitRemote,
  projectIconSourceUrl,
  projectMonogram,
  projectMonogramColor,
} from "./project-icon.js";

describe("parseGitRemote", () => {
  it.each([
    ["git@github.com:acme/widgets.git", { host: "github.com", owner: "acme", repo: "widgets" }],
    ["https://github.com/acme/widgets", { host: "github.com", owner: "acme", repo: "widgets" }],
    ["https://github.com/acme/widgets.git/", { host: "github.com", owner: "acme", repo: "widgets" }],
    ["ssh://git@GitHub.com/acme/widgets.git", { host: "github.com", owner: "acme", repo: "widgets" }],
    ["https://gitlab.com/group/sub/repo.git", { host: "gitlab.com", owner: "group", repo: "repo" }],
  ])("parses %s", (remote, expected) => {
    expect(parseGitRemote(remote)).toEqual(expected);
  });

  it.each([null, "", "   ", "not a url", "https://github.com/onlyowner", "/srv/git/repo.git"])(
    "returns null for %j",
    (remote) => {
      expect(parseGitRemote(remote)).toBeNull();
    },
  );
});

describe("projectIconSourceUrl", () => {
  it("uses the GitHub organization avatar", () => {
    expect(projectIconSourceUrl(parseGitRemote("git@github.com:acme/widgets.git"))).toBe(
      "https://github.com/acme.png?size=64",
    );
  });

  it.each(["https://github.com/get-bb/bb", "https://github.com/benwaffle/bb.git", "git@github.com:get-bb/bb-plugins.git"])(
    "uses the getbb.app favicon for bb (%s)",
    (remote) => {
      expect(projectIconSourceUrl(parseGitRemote(remote))).toBe(BB_FAVICON_URL);
    },
  );

  it("falls back to the monogram for other hosts and missing remotes", () => {
    expect(projectIconSourceUrl(parseGitRemote("https://gitlab.com/acme/widgets"))).toBeNull();
    expect(projectIconSourceUrl(null)).toBeNull();
  });
});

describe("project monogram", () => {
  it.each([
    ["atlas", "AS"],
    ["lumen", "LN"],
    ["bb-plugins", "BP"],
    ["My cool project", "MC"],
    ["x", "X"],
    ["---", "?"],
  ])("draws %s as %s", (name, letters) => {
    expect(projectMonogram(name)).toBe(letters);
  });

  it("tints the same name the same way, ignoring case and padding", () => {
    expect(projectMonogramColor("Atlas")).toBe(projectMonogramColor(" atlas "));
    expect(MONOGRAM_COLORS).toContain(projectMonogramColor("atlas"));
    const tints = new Set(
      ["atlas", "lumen", "quarry", "orbit", "bb", "dotfiles", "infra", "web"].map(
        projectMonogramColor,
      ),
    );
    expect(tints.size).toBeGreaterThan(1);
  });
});
