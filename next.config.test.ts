import { describe, expect, it } from "vitest";
import config from "./next.config";

describe("practical lab external rewrites", () => {
  it("mounts the lab UI and API before local filesystem routes", async () => {
    expect(config.rewrites).toBeTypeOf("function");

    const rewrites = await config.rewrites!();
    if (Array.isArray(rewrites)) {
      throw new Error("expected beforeFiles rewrite groups");
    }

    expect(rewrites).toEqual({
      beforeFiles: [
        {
          source: "/bukai",
          destination: "https://examserver-lab-origin.vercel.app/bukai",
        },
        {
          source: "/bukai/:path+",
          destination:
            "https://examserver-lab-origin.vercel.app/bukai/:path+",
        },
        {
          source: "/lab",
          destination: "https://examserver-lab-origin.vercel.app/lab",
        },
        {
          source: "/lab/:path+",
          destination:
            "https://examserver-lab-origin.vercel.app/lab/:path+",
        },
        {
          source: "/api/lab",
          destination: "https://examserver-lab-origin.vercel.app/api/lab",
        },
        {
          source: "/api/lab/:path+",
          destination:
            "https://examserver-lab-origin.vercel.app/api/lab/:path+",
        },
      ],
      afterFiles: [],
      fallback: [],
    });
  });
});
